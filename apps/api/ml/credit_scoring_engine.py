"""
CODA Credit Scoring Engine
==========================

Robust statistical credit scoring using Logistic Regression, XGBoost, and ensemble methods.
Based on academic research: "The Value of Open Banking Data for Application Credit Scoring" (2022)

Features:
- CMF data (Informe de Deudas)
- SFA transactional data (Cartolas 90 días)
- Logistic Regression (interpretable baseline)
- XGBoost (production model)
- Ensemble voting
- SHAP explainability
- Probability calibration
- Score conversion (300-850)

Author: AI Assistant (Cursor)
Date: March 2, 2026
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
import pickle
import json
from pathlib import Path

# ML Libraries
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import roc_auc_score, brier_score_loss, log_loss
import xgboost as xgb

# Explainability
try:
    import shap
    SHAP_AVAILABLE = True
except ImportError:
    SHAP_AVAILABLE = False
    print("⚠️  SHAP not installed. Explainability features disabled.")


@dataclass
class CreditScoreResult:
    """Result of credit scoring prediction"""
    score: int  # 300-850
    probability_default: float  # 0-1
    risk_category: str  # EXCELLENT, GOOD, AVERAGE, POOR, VERY_POOR
    confidence: float  # 0-1
    top_factors: List[Dict]  # SHAP-based explanations
    model_version: str


@dataclass
class CmfFeatures:
    """Features extracted from CMF Informe de Deudas"""
    deuda_total_vigente: float
    deuda_indirecta: float
    numero_instituciones: int
    
    # Engineered features
    @property
    def has_debt(self) -> bool:
        return self.deuda_total_vigente > 0
    
    @property
    def debt_ratio(self) -> float:
        """Ratio of indirect debt to total debt"""
        if self.deuda_total_vigente == 0:
            return 0.0
        return self.deuda_indirecta / self.deuda_total_vigente
    
    @property
    def debt_per_institution(self) -> float:
        """Average debt per institution"""
        if self.numero_instituciones == 0:
            return 0.0
        return self.deuda_total_vigente / self.numero_instituciones


@dataclass
class SfaTransactionalFeatures:
    """Features extracted from SFA transactional data (cartolas)"""
    avg_monthly_balance: float
    min_balance: float
    max_balance: float
    balance_volatility: float
    
    total_income: float
    total_expenses: float
    net_cash_flow: float
    income_regularity: float  # 0-1
    
    num_transactions: int
    avg_transaction_size: float
    num_overdrafts: int
    overdraft_days: int
    
    # Ratios
    @property
    def savings_rate(self) -> float:
        """(Income - Expenses) / Income"""
        if self.total_income == 0:
            return 0.0
        return (self.total_income - self.total_expenses) / self.total_income
    
    @property
    def overdraft_frequency(self) -> float:
        """Overdrafts per month"""
        return self.num_overdrafts / 3.0  # 90 days = 3 months


class FeatureEngineering:
    """Feature engineering for credit scoring"""
    
    @staticmethod
    def extract_cmf_features(cmf_data: Dict) -> CmfFeatures:
        """Extract features from CMF informe"""
        return CmfFeatures(
            deuda_total_vigente=cmf_data.get('deudaTotalVigente', 0),
            deuda_indirecta=cmf_data.get('deudaIndirecta', 0),
            numero_instituciones=cmf_data.get('numeroInstituciones', 0)
        )
    
    @staticmethod
    def extract_sfa_features(sfa_data: Dict) -> SfaTransactionalFeatures:
        """Extract features from SFA transactional score"""
        metrics = sfa_data.get('metrics', {})
        
        return SfaTransactionalFeatures(
            avg_monthly_balance=metrics.get('averageMonthlyBalanceClp', 0),
            min_balance=metrics.get('minBalance', 0),
            max_balance=metrics.get('maxBalance', 0),
            balance_volatility=metrics.get('balanceVolatility', 0),
            
            total_income=metrics.get('totalIncome', 0),
            total_expenses=metrics.get('totalExpenses', 0),
            net_cash_flow=metrics.get('netCashFlow', 0),
            income_regularity=metrics.get('incomeRegularity', 0),
            
            num_transactions=metrics.get('numTransactions', 0),
            avg_transaction_size=metrics.get('avgTransactionSize', 0),
            num_overdrafts=metrics.get('numOverdrafts', 0),
            overdraft_days=metrics.get('overdraftDays', 0)
        )
    
    @staticmethod
    def create_feature_vector(
        cmf: CmfFeatures,
        sfa: SfaTransactionalFeatures,
        demographics: Optional[Dict] = None
    ) -> np.ndarray:
        """Create feature vector for model input"""
        features = [
            # CMF features
            cmf.deuda_total_vigente / 1_000_000,  # Normalize to millions
            cmf.deuda_indirecta / 1_000_000,
            cmf.numero_instituciones,
            float(cmf.has_debt),
            cmf.debt_ratio,
            cmf.debt_per_institution / 1_000_000,
            
            # SFA features
            sfa.avg_monthly_balance / 1_000_000,
            sfa.balance_volatility / 1_000_000,
            sfa.net_cash_flow / 1_000_000,
            sfa.income_regularity,
            sfa.savings_rate,
            sfa.num_transactions,
            sfa.overdraft_frequency,
            sfa.overdraft_days,
        ]
        
        # Demographics (optional)
        if demographics:
            features.extend([
                demographics.get('age', 0) / 100,  # Normalize
                demographics.get('income', 0) / 1_000_000,
                demographics.get('employment_length', 0) / 100
            ])
        
        return np.array(features).reshape(1, -1)


class CreditScoringModel:
    """Credit scoring model ensemble (Logistic Regression + XGBoost)"""
    
    FEATURE_NAMES = [
        'cmf_deuda_total', 'cmf_deuda_indirecta', 'cmf_num_instituciones',
        'cmf_has_debt', 'cmf_debt_ratio', 'cmf_debt_per_institution',
        'sfa_avg_balance', 'sfa_volatility', 'sfa_net_cash_flow',
        'sfa_income_regularity', 'sfa_savings_rate', 'sfa_num_transactions',
        'sfa_overdraft_freq', 'sfa_overdraft_days'
    ]
    
    RISK_CATEGORIES = {
        'EXCELLENT': (750, 850),
        'GOOD': (680, 749),
        'AVERAGE': (620, 679),
        'POOR': (550, 619),
        'VERY_POOR': (300, 549),
    }
    
    def __init__(self, model_path: Optional[str] = None):
        """Initialize credit scoring model"""
        self.lr_model = None
        self.xgb_model = None
        self.scaler = StandardScaler()
        self.is_trained = False
        self.model_version = "v2.0.0"
        
        if model_path and Path(model_path).exists():
            self.load(model_path)
    
    def train(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: np.ndarray,
        y_val: np.ndarray
    ):
        """Train both Logistic Regression and XGBoost models"""
        print("🚀 Training credit scoring models...")
        
        # Scale features
        X_train_scaled = self.scaler.fit_transform(X_train)
        X_val_scaled = self.scaler.transform(X_val)
        
        # 1. Logistic Regression (baseline)
        print("  📊 Training Logistic Regression...")
        self.lr_model = LogisticRegression(
            penalty='l2',
            C=1.0,
            class_weight='balanced',
            max_iter=1000,
            random_state=42
        )
        self.lr_model.fit(X_train_scaled, y_train)
        
        # Calibrate LR probabilities
        self.lr_model = CalibratedClassifierCV(
            self.lr_model,
            method='isotonic',
            cv=5
        )
        self.lr_model.fit(X_train_scaled, y_train)
        
        lr_auc = roc_auc_score(y_val, self.lr_model.predict_proba(X_val_scaled)[:, 1])
        print(f"    ✅ Logistic Regression AUC: {lr_auc:.4f}")
        
        # 2. XGBoost (production model)
        print("  🌲 Training XGBoost...")
        scale_pos_weight = (y_train == 0).sum() / (y_train == 1).sum()
        
        self.xgb_model = xgb.XGBClassifier(
            max_depth=6,
            learning_rate=0.01,
            n_estimators=500,
            subsample=0.8,
            colsample_bytree=0.8,
            gamma=0.1,
            reg_alpha=0.1,
            reg_lambda=1.0,
            scale_pos_weight=scale_pos_weight,
            eval_metric='auc',
            early_stopping_rounds=50,
            random_state=42
        )
        
        self.xgb_model.fit(
            X_train_scaled, y_train,
            eval_set=[(X_val_scaled, y_val)],
            verbose=False
        )
        
        xgb_auc = roc_auc_score(y_val, self.xgb_model.predict_proba(X_val_scaled)[:, 1])
        print(f"    ✅ XGBoost AUC: {xgb_auc:.4f}")
        
        # Ensemble performance
        ensemble_pred = self._ensemble_predict_proba(X_val_scaled)
        ensemble_auc = roc_auc_score(y_val, ensemble_pred)
        print(f"  🎯 Ensemble AUC: {ensemble_auc:.4f}")
        print(f"  📈 Gini coefficient: {2 * ensemble_auc - 1:.4f}")
        
        self.is_trained = True
        return {
            'lr_auc': lr_auc,
            'xgb_auc': xgb_auc,
            'ensemble_auc': ensemble_auc,
            'gini': 2 * ensemble_auc - 1
        }
    
    def _ensemble_predict_proba(self, X: np.ndarray) -> np.ndarray:
        """Ensemble prediction (weighted voting)"""
        if not self.is_trained:
            raise ValueError("Model not trained. Call train() first.")
        
        lr_proba = self.lr_model.predict_proba(X)[:, 1]
        xgb_proba = self.xgb_model.predict_proba(X)[:, 1]
        
        # Weighted average (XGBoost 70%, LR 30%)
        ensemble_proba = 0.3 * lr_proba + 0.7 * xgb_proba
        return ensemble_proba
    
    def predict(
        self,
        cmf: CmfFeatures,
        sfa: SfaTransactionalFeatures,
        demographics: Optional[Dict] = None
    ) -> CreditScoreResult:
        """Predict credit score for a single application"""
        if not self.is_trained:
            raise ValueError("Model not trained. Call train() first.")
        
        # Extract features
        X = FeatureEngineering.create_feature_vector(cmf, sfa, demographics)
        X_scaled = self.scaler.transform(X)
        
        # Predict probability of default
        pd = self._ensemble_predict_proba(X_scaled)[0]
        
        # Convert to score (300-850)
        score = self._probability_to_score(pd)
        
        # Risk category
        risk_category = self._get_risk_category(score)
        
        # Confidence (inverse of prediction variance)
        lr_proba = self.lr_model.predict_proba(X_scaled)[0, 1]
        xgb_proba = self.xgb_model.predict_proba(X_scaled)[0, 1]
        confidence = 1 - abs(lr_proba - xgb_proba)
        
        # Explainability (SHAP)
        top_factors = self._explain_prediction(X_scaled) if SHAP_AVAILABLE else []
        
        return CreditScoreResult(
            score=score,
            probability_default=float(pd),
            risk_category=risk_category,
            confidence=float(confidence),
            top_factors=top_factors,
            model_version=self.model_version
        )
    
    def _probability_to_score(self, pd: float, min_score=300, max_score=850) -> int:
        """Convert Probability of Default to credit score (300-850)"""
        # Log-odds transformation
        odds = (1 - pd) / max(pd, 0.001)
        log_odds = np.log(odds)
        
        # Scale to 300-850 range
        offset = 600  # Average score
        scale = 100   # Sensitivity
        
        score = offset + scale * log_odds
        score = np.clip(score, min_score, max_score)
        
        return int(round(score))
    
    def _get_risk_category(self, score: int) -> str:
        """Get risk category from score"""
        for category, (min_s, max_s) in self.RISK_CATEGORIES.items():
            if min_s <= score <= max_s:
                return category
        return 'UNKNOWN'
    
    def _explain_prediction(self, X: np.ndarray) -> List[Dict]:
        """Explain prediction using SHAP values"""
        if not SHAP_AVAILABLE:
            return []
        
        try:
            # SHAP explainer for XGBoost
            explainer = shap.TreeExplainer(self.xgb_model)
            shap_values = explainer.shap_values(X)
            
            # Top 5 features by absolute impact
            impacts = shap_values[0]
            feature_importance = pd.DataFrame({
                'feature': self.FEATURE_NAMES[:len(impacts)],
                'impact': impacts,
                'value': X[0]
            }).sort_values('impact', key=abs, ascending=False).head(5)
            
            # Format for API response
            top_factors = []
            for _, row in feature_importance.iterrows():
                top_factors.append({
                    'feature': row['feature'],
                    'value': float(row['value']),
                    'impact': float(row['impact']),
                    'direction': 'positive' if row['impact'] > 0 else 'negative'
                })
            
            return top_factors
        except Exception as e:
            print(f"⚠️  SHAP explanation failed: {e}")
            return []
    
    def save(self, path: str):
        """Save models to disk"""
        model_data = {
            'lr_model': self.lr_model,
            'xgb_model': self.xgb_model,
            'scaler': self.scaler,
            'model_version': self.model_version,
            'is_trained': self.is_trained
        }
        
        with open(path, 'wb') as f:
            pickle.dump(model_data, f)
        
        print(f"✅ Model saved to {path}")
    
    def load(self, path: str):
        """Load models from disk"""
        with open(path, 'rb') as f:
            model_data = pickle.load(f)
        
        self.lr_model = model_data['lr_model']
        self.xgb_model = model_data['xgb_model']
        self.scaler = model_data['scaler']
        self.model_version = model_data['model_version']
        self.is_trained = model_data['is_trained']
        
        print(f"✅ Model loaded from {path} (version: {self.model_version})")


# Example usage
if __name__ == "__main__":
    print("🎯 CODA Credit Scoring Engine - Test")
    print("=" * 60)
    
    # Mock data for testing
    cmf = CmfFeatures(
        deuda_total_vigente=0,
        deuda_indirecta=0,
        numero_instituciones=0
    )
    
    sfa = SfaTransactionalFeatures(
        avg_monthly_balance=500_000,
        min_balance=100_000,
        max_balance=800_000,
        balance_volatility=150_000,
        total_income=1_500_000,
        total_expenses=1_200_000,
        net_cash_flow=300_000,
        income_regularity=0.85,
        num_transactions=50,
        avg_transaction_size=30_000,
        num_overdrafts=0,
        overdraft_days=0
    )
    
    print("\n📊 Sample Input:")
    print(f"  CMF: No debt, 0 institutions")
    print(f"  SFA: Avg balance $500K, Income regularity 85%")
    
    # Note: Model needs to be trained first
    print("\n⚠️  Model needs training data to make predictions")
    print("   Use train() method with historical default data")
