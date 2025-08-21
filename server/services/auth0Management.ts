import { ManagementClient } from 'auth0';

// Check if Auth0 Management API credentials are configured
const hasManagementCredentials = () => {
  const clientId = process.env.AUTH0_M2M_CLIENT_ID;
  const clientSecret = process.env.AUTH0_M2M_CLIENT_SECRET;
  
  return !!(clientId && 
           clientSecret && 
           clientId !== 'your-m2m-client-id' && 
           clientSecret !== 'your-m2m-client-secret');
};

// Initialize Auth0 Management API client only if credentials are available
let management: ManagementClient | null = null;

if (hasManagementCredentials()) {
  const auth0Domain = (process.env.AUTH0_ISSUER_BASE_URL || '')
    .replace('https://', '')
    .replace(/\/$/, ''); // Remove trailing slash

  console.log(`🔧 Initializing Auth0 Management API client for domain: "${auth0Domain}"`);

  management = new ManagementClient({
    domain: auth0Domain,
    clientId: process.env.AUTH0_M2M_CLIENT_ID || '',
    clientSecret: process.env.AUTH0_M2M_CLIENT_SECRET || ''
  });
  console.log('✅ Auth0 Management API client initialized');
} else {
  console.warn('⚠️ Auth0 Management API credentials not found. User management features will be disabled.');
  console.warn('Please set AUTH0_M2M_CLIENT_ID and AUTH0_M2M_CLIENT_SECRET environment variables.');
}

export class Auth0ManagementService {
  
  /**
   * Change user password by sending a password reset email
   */
  static async sendPasswordChangeEmail(userId: string): Promise<void> {
    if (!management) {
      throw new Error('Auth0 Management API not configured. Please set AUTH0_M2M_CLIENT_ID and AUTH0_M2M_CLIENT_SECRET.');
    }
    
    try {
      await management.tickets.changePassword({
        user_id: userId,
        client_id: process.env.AUTH0_CLIENT_ID,
        connection_id: 'con_your_connection_id', // You'll need to get this from Auth0 dashboard
        email: '', // Will be populated by Auth0 based on user_id
        ttl_sec: 3600 // 1 hour expiration
      });
    } catch (error) {
      console.error('Error sending password change email:', error);
      throw new Error('Failed to send password change email');
    }
  }

  /**
   * Get user's MFA enrollments
   */
  static async getUserMFAEnrollments(_userId: string): Promise<Record<string, unknown>[]> {
    if (!management) {
      throw new Error('Auth0 Management API not configured. Please set AUTH0_M2M_CLIENT_ID and AUTH0_M2M_CLIENT_SECRET.');
    }
    
    try {
      // Note: Auth0 Management API v4+ has changed method names
      // This is a fallback implementation for now
      console.warn('MFA enrollment check not fully implemented - returning empty array');
      return [];
    } catch (error) {
      console.error('Error getting MFA enrollments:', error);
      return [];
    }
  }

  /**
   * Generate MFA enrollment ticket for the user
   */
  static async generateMFAEnrollmentTicket(_userId: string): Promise<string> {
    if (!management) {
      throw new Error('Auth0 Management API not configured. Please set AUTH0_M2M_CLIENT_ID and AUTH0_M2M_CLIENT_SECRET.');
    }
    
    try {
      // Note: Auth0 Management API v4+ may have different method signatures
      // This is a fallback implementation
      console.warn('MFA enrollment ticket generation not fully implemented');
      return '';
    } catch (error) {
      console.error('Error generating MFA enrollment ticket:', error);
      return '';
    }
  }

  /**
   * Delete user account from Auth0
   */
  static async deleteUser(userId: string): Promise<void> {
    if (!management) {
      throw new Error('Auth0 Management API not configured. Please set AUTH0_M2M_CLIENT_ID and AUTH0_M2M_CLIENT_SECRET.');
    }
    
    try {
      console.log(`Attempting to delete user ${userId} from Auth0...`);
      
      // The Auth0 SDK should handle URL-encoding of the userId.
      await management.users.delete({ id: userId });
      
      console.log(`User ${userId} successfully deleted from Auth0.`);
    } catch (error) {
      const errorObj = error as { statusCode?: number; message?: string; body?: unknown; stack?: string };
      console.error('Error deleting user from Auth0:', {
        statusCode: errorObj.statusCode,
        message: errorObj.message,
        body: errorObj.body,
        stack: errorObj.stack
      });
      throw new Error(`Failed to delete Auth0 user: ${errorObj.message || 'Unknown error'}`);
    }
  }

  /**
   * Get user details from Auth0
   */
  static async getUser(userId: string): Promise<Record<string, unknown>> {
    if (!management) {
      throw new Error('Auth0 Management API not configured. Please set AUTH0_M2M_CLIENT_ID and AUTH0_M2M_CLIENT_SECRET.');
    }
    
    try {
      const user = await management.users.get({ id: userId });
      return user.data;
    } catch (error) {
      console.error('Error getting user:', error);
      throw new Error('Failed to get user details');
    }
  }

  /**
   * Update user metadata
   */
  static async updateUserMetadata(userId: string, metadata: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!management) {
      throw new Error('Auth0 Management API not configured. Please set AUTH0_M2M_CLIENT_ID and AUTH0_M2M_CLIENT_SECRET.');
    }
    
    try {
      const user = await management.users.update(
        { id: userId },
        { user_metadata: metadata }
      );
      return user.data;
    } catch (error) {
      console.error('Error updating user metadata:', error);
      throw new Error('Failed to update user metadata');
    }
  }

  /**
   * Check if user has MFA enabled
   */
  static async checkMFAStatus(userId: string): Promise<{ enabled: boolean; enrollments: Record<string, unknown>[] }> {
    try {
      const enrollments = await this.getUserMFAEnrollments(userId);
      const enabled = enrollments.length > 0 && enrollments.some(e => e.status === 'confirmed');
      
      return {
        enabled,
        enrollments: enrollments || []
      };
    } catch (error) {
      console.error('Error checking MFA status:', error);
      return { enabled: false, enrollments: [] };
    }
  }
}
