/**
 * Automatic Expense Categorizer
 * 
 * Maps merchant names and transaction descriptions to expense categories.
 * Uses SFA-compatible categorization aligned with NCG 514.
 * 
 * Categories match the existing CODA expense schema:
 * groceries, dining, transportation, housing, healthcare,
 * entertainment, shopping, utilities, education, travel, other
 */

export interface ExpenseCategorization {
  category: string;
  subcategory?: string;
  confidence: number;
}

interface MerchantRule {
  keywords: string[];
  category: string;
  subcategory?: string;
}

/**
 * Merchant-based categorization rules
 * Keywords are matched case-insensitively against merchant name
 */
const MERCHANT_RULES: MerchantRule[] = [
  // Supermercados / Groceries
  { keywords: ['lider', 'jumbo', 'tottus', 'unimarc', 'santa isabel', 'acuenta', 'mayorista 10', 'supermercado', 'almac'], category: 'groceries', subcategory: 'supermercado' },
  { keywords: ['ok market', 'minimarket', 'big john', 'oxxo', 'express de lider'], category: 'groceries', subcategory: 'minimarket' },
  { keywords: ['feria', 'verduleria', 'carniceria', 'panaderia'], category: 'groceries', subcategory: 'mercado' },

  // Dining / Restaurantes
  { keywords: ['starbucks', 'juan maestro', 'mcdonald', 'burger king', 'subway', 'domino', 'pizza hut', 'papa john', 'dunkin'], category: 'dining', subcategory: 'fast_food' },
  { keywords: ['uber eats', 'rappi', 'pedidosya', 'cornershop', 'didi food'], category: 'dining', subcategory: 'delivery' },
  { keywords: ['restaurant', 'restaurante', 'cafe', 'cafeteria', 'bar', 'pub', 'sushi', 'ceviche', 'parrilla', 'grill'], category: 'dining', subcategory: 'restaurante' },

  // Transporte
  { keywords: ['uber', 'didi', 'cabify', 'beat', 'indriver'], category: 'transportation', subcategory: 'ride_hailing' },
  { keywords: ['copec', 'shell', 'petrobras', 'enex', 'gasolina', 'bencina', 'combustible', 'terpel'], category: 'transportation', subcategory: 'combustible' },
  { keywords: ['bip', 'metro', 'transantiago', 'red', 'microbus', 'bus'], category: 'transportation', subcategory: 'transporte_publico' },
  { keywords: ['latam', 'sky airline', 'jetsmart', 'avianca', 'aeropuerto'], category: 'travel', subcategory: 'vuelos' },
  { keywords: ['estacionamiento', 'parking', 'autopista', 'peaje', 'tag'], category: 'transportation', subcategory: 'auto' },

  // Vivienda / Housing
  { keywords: ['arriendo', 'alquiler', 'renta', 'inmobiliaria'], category: 'housing', subcategory: 'arriendo' },
  { keywords: ['dividendo', 'hipotecario', 'mutuo'], category: 'housing', subcategory: 'hipoteca' },
  { keywords: ['sodimac', 'easy', 'homecenter', 'imperial', 'construmart', 'ferreteria'], category: 'housing', subcategory: 'hogar' },

  // Servicios / Utilities
  { keywords: ['enel', 'chilquinta', 'cge', 'saesa', 'electricidad', 'luz'], category: 'utilities', subcategory: 'electricidad' },
  { keywords: ['aguas andinas', 'esval', 'nuevo sur', 'agua'], category: 'utilities', subcategory: 'agua' },
  { keywords: ['metrogas', 'gasco', 'lipigas', 'abastible', 'gas'], category: 'utilities', subcategory: 'gas' },
  { keywords: ['entel', 'movistar', 'claro', 'wom', 'vtr', 'gtd', 'telsur', 'celular', 'internet', 'telefon'], category: 'utilities', subcategory: 'telecomunicaciones' },

  // Entretenimiento
  { keywords: ['netflix', 'spotify', 'disney', 'hbo', 'amazon prime', 'apple tv', 'youtube premium', 'crunchyroll', 'paramount'], category: 'entertainment', subcategory: 'streaming' },
  { keywords: ['steam', 'playstation', 'xbox', 'nintendo', 'epic games', 'riot'], category: 'entertainment', subcategory: 'gaming' },
  { keywords: ['cinemark', 'cineplanet', 'cinehoyts', 'cine'], category: 'entertainment', subcategory: 'cine' },
  { keywords: ['gym', 'smartfit', 'pacific', 'crossfit', 'sportlife'], category: 'entertainment', subcategory: 'deporte' },

  // Shopping / Tiendas
  { keywords: ['falabella', 'ripley', 'paris', 'la polar', 'hites', 'abcdin', 'mall', 'retail'], category: 'shopping', subcategory: 'tienda_departamental' },
  { keywords: ['aliexpress', 'amazon', 'mercadolibre', 'mercado libre', 'wish', 'shein', 'temu'], category: 'shopping', subcategory: 'online' },
  { keywords: ['nike', 'adidas', 'puma', 'zara', 'h&m', 'uniqlo', 'ropa', 'calzado', 'zapato'], category: 'shopping', subcategory: 'ropa' },
  { keywords: ['apple', 'samsung', 'huawei', 'pcfactory', 'sp digital', 'tecnolog'], category: 'shopping', subcategory: 'tecnologia' },

  // Salud / Healthcare
  { keywords: ['farmacia', 'cruz verde', 'salcobrand', 'ahumada', 'dr. simi'], category: 'healthcare', subcategory: 'farmacia' },
  { keywords: ['isapre', 'fonasa', 'consulta', 'doctor', 'clinica', 'hospital', 'dentista', 'optica'], category: 'healthcare', subcategory: 'salud' },

  // Educación
  { keywords: ['universidad', 'colegio', 'instituto', 'duoc', 'inacap', 'usach', 'uchile', 'puc', 'matricula', 'arancel'], category: 'education', subcategory: 'arancel' },
  { keywords: ['udemy', 'coursera', 'platzi', 'domestika', 'skillshare'], category: 'education', subcategory: 'cursos_online' },
  { keywords: ['libreria', 'libro', 'buscalibre', 'antártica'], category: 'education', subcategory: 'libros' },

  // Viajes
  { keywords: ['hotel', 'hostal', 'airbnb', 'booking', 'despegar', 'kayak', 'trivago'], category: 'travel', subcategory: 'alojamiento' },
  { keywords: ['turismo', 'tour', 'excursion'], category: 'travel', subcategory: 'turismo' },

  // Financiero (transferencias, pagos de deuda)
  { keywords: ['transferencia', 'tef', 'traspaso'], category: 'other', subcategory: 'transferencia' },
  { keywords: ['cuota', 'credito', 'préstamo', 'pago deuda'], category: 'other', subcategory: 'pago_credito' },
  { keywords: ['seguro', 'poliza', 'aseguradora'], category: 'other', subcategory: 'seguro' },
];

/**
 * Categorize an expense based on merchant name and amount
 */
export function categorizeExpense(
  merchantName: string,
  amount?: number,
  description?: string
): ExpenseCategorization {
  const searchText = `${merchantName} ${description || ''}`.toLowerCase();

  for (const rule of MERCHANT_RULES) {
    for (const keyword of rule.keywords) {
      if (searchText.includes(keyword.toLowerCase())) {
        return {
          category: rule.category,
          subcategory: rule.subcategory,
          confidence: 0.85,
        };
      }
    }
  }

  // Amount-based heuristics when no merchant match
  if (amount) {
    if (amount >= 300000 && amount <= 2000000) {
      return { category: 'housing', subcategory: 'arriendo', confidence: 0.3 };
    }
    if (amount <= 5000) {
      return { category: 'dining', subcategory: 'cafe', confidence: 0.3 };
    }
  }

  return { category: 'other', confidence: 0.1 };
}

/**
 * Batch categorize multiple expenses
 */
export function categorizeExpenses(
  items: Array<{ merchantName: string; amount?: number; description?: string }>
): ExpenseCategorization[] {
  return items.map(item => categorizeExpense(item.merchantName, item.amount, item.description));
}
