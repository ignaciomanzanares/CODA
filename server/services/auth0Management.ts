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
    clientSecret: process.env.AUTH0_M2M_CLIENT_SECRET || '',
    scope: 'read:users update:users delete:users create:user_tickets',
    audience: `https://${auth0Domain}/api/v2/`
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
  static async getUserMFAEnrollments(userId: string): Promise<any[]> {
    if (!management) {
      throw new Error('Auth0 Management API not configured. Please set AUTH0_M2M_CLIENT_ID and AUTH0_M2M_CLIENT_SECRET.');
    }
    
    try {
      const enrollments = await management.users.getGuardianEnrollments({ id: userId });
      return enrollments.data || [];
    } catch (error) {
      console.error('Error getting MFA enrollments:', error);
      throw new Error('Failed to get MFA enrollments');
    }
  }

  /**
   * Generate MFA enrollment ticket for the user
   */
  static async generateMFAEnrollmentTicket(userId: string): Promise<string> {
    if (!management) {
      throw new Error('Auth0 Management API not configured. Please set AUTH0_M2M_CLIENT_ID and AUTH0_M2M_CLIENT_SECRET.');
    }
    
    try {
      const ticket = await management.tickets.post({
        user_id: userId,
        result_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/profile?tab=security`,
        includeEmailInRedirect: false
      });
      
      return ticket.data.ticket || '';
    } catch (error) {
      console.error('Error generating MFA enrollment ticket:', error);
      throw new Error('Failed to generate MFA enrollment ticket');
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
      console.error('Error deleting user from Auth0:', {
        statusCode: error.statusCode,
        message: error.message,
        body: error.body,
        stack: error.stack
      });
      throw new Error(`Failed to delete Auth0 user: ${error.message}`);
    }
  }

  /**
   * Get user details from Auth0
   */
  static async getUser(userId: string): Promise<any> {
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
  static async updateUserMetadata(userId: string, metadata: any): Promise<any> {
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
  static async checkMFAStatus(userId: string): Promise<{ enabled: boolean; enrollments: any[] }> {
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
