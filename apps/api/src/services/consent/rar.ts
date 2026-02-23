/**
 * Generación de authorization_details (RFC 9396 RAR).
 * Consentimiento granular: solo se incluyen los tipos de recurso solicitados.
 */

import type { AuthorizationDetail, AuthorizationDetails, ConsentResourceType } from './types.js';

const LOCATIONS_ACCOUNTS = ['https://api.coda.cl/sfa/accounts'];
const LOCATIONS_PRODUCTS = ['https://api.coda.cl/sfa/products'];
const LOCATIONS_HISTORICAL = ['https://api.coda.cl/sfa/historical-positions'];
const LOCATIONS_TC = ['https://api.coda.cl/sfa/terms'];
const LOCATIONS_PAYMENTS = ['https://api.coda.cl/sfa/payments'];

function buildDetail(type: ConsentResourceType): AuthorizationDetail {
  switch (type) {
    case 'account_information':
      return {
        type: 'account_information',
        actions: ['list_accounts', 'read_balances', 'read_transactions'],
        locations: LOCATIONS_ACCOUNTS,
      };
    case 'products_vigentes':
      return {
        type: 'products_vigentes',
        actions: ['read_products'],
        locations: LOCATIONS_PRODUCTS,
      };
    case 'historical_positions':
      return {
        type: 'historical_positions',
        actions: ['read'],
        locations: LOCATIONS_HISTORICAL,
      };
    case 'terms_and_conditions':
      return {
        type: 'terms_and_conditions',
        actions: ['read'],
        locations: LOCATIONS_TC,
      };
    case 'payment_initiation':
      return {
        type: 'payment_initiation',
        actions: ['initiate', 'status', 'cancel'],
        locations: LOCATIONS_PAYMENTS,
      };
    default:
      return { type, actions: ['read'], locations: [] };
  }
}

/**
 * Construye el array authorization_details para los tipos solicitados.
 * Si el usuario solo pide score de cuentas, solo se incluye account_information (no seguros ni T&C).
 */
export function buildAuthorizationDetails(resourceTypes: ConsentResourceType[]): AuthorizationDetails {
  const seen = new Set<ConsentResourceType>();
  const details: AuthorizationDetail[] = [];
  for (const t of resourceTypes) {
    if (seen.has(t)) continue;
    seen.add(t);
    details.push(buildDetail(t));
  }
  return details;
}

/** Serializa authorization_details a JSON para persistencia. */
export function serializeAuthorizationDetails(details: AuthorizationDetails): string {
  return JSON.stringify(details);
}

/** Parsea authorization_details desde JSON almacenado. */
export function parseAuthorizationDetails(json: string): AuthorizationDetails {
  try {
    const parsed = JSON.parse(json) as AuthorizationDetails;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
