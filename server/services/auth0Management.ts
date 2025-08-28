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
      // First get user details to get email and connection
      const user = await management.users.get({ id: userId });
      if (!user.data.email) {
        throw new Error('User does not have an email address');
      }

      // Create password change ticket
      const ticket = await management.tickets.changePassword({
        user_id: userId,
        client_id: process.env.AUTH0_CLIENT_ID || '',
        ttl_sec: 3600, // 1 hour expiration
        mark_email_as_verified: true,
        includeEmailInRedirect: false
      });
      
      console.log(`Password change ticket created for user ${userId}`);
      
      // Send the email with the ticket URL
      const resetUrl = ticket.data.ticket;
      if (resetUrl) {
        await this.sendPasswordResetEmail(user.data.email as string, resetUrl);
        console.log(`Password reset email sent to ${user.data.email}`);
      } else {
        throw new Error('No password reset ticket URL generated');
      }
    } catch (error) {
      console.error('Error sending password change email:', error);
      throw new Error('Failed to send password change email');
    }
  }
  
  /**
   * Send password reset email using nodemailer
   */
  private static async sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
    // Check if Gmail credentials are configured
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      console.warn('Gmail credentials not configured. Password reset email not sent.');
      console.log('Reset URL (for testing):', resetUrl);
      return;
    }
    
    // Dynamic import for ES modules compatibility
    const nodemailer = await import('nodemailer');
    
    // Create transporter - use direct export
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });
    
    // Email template
    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: email,
      subject: 'FinHealth - Password Reset Request',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #3b82f6;">Password Reset Request</h2>
          <p>You requested a password reset for your FinHealth account.</p>
          <p>Click the button below to reset your password:</p>
          <p style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a>
          </p>
          <p style="color: #666; font-size: 14px;">This link will expire in 1 hour for security reasons.</p>
          <p style="color: #666; font-size: 14px;">If you didn't request this password reset, please ignore this email.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #999; font-size: 12px;">FinHealth Team</p>
        </div>
      `
    };
    
    await transporter.sendMail(mailOptions);
  }

  /**
   * Get user's MFA enrollments
   */
  static async getUserMFAEnrollments(userId: string): Promise<Record<string, unknown>[]> {
    if (!management) {
      throw new Error('Auth0 Management API not configured. Please set AUTH0_M2M_CLIENT_ID and AUTH0_M2M_CLIENT_SECRET.');
    }
    
    try {
      // Get user's MFA enrollments using the correct Auth0 Management API v3 method
      const enrollments = await management.users.getEnrollments({ id: userId });
      return enrollments.data || [];
    } catch (error) {
      console.error('Error getting MFA enrollments:', error);
      // If MFA is not enabled for the tenant, this might fail
      return [];
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
      // Create a Guardian enrollment ticket
      const ticket = await management.tickets.createEmailVerificationTicket({
        user_id: userId,
        client_id: process.env.AUTH0_CLIENT_ID || '',
        ttl_sec: 3600, // 1 hour expiration
        includeEmailInRedirect: false
      });
      
      // For MFA, we need to construct the enrollment URL
      // This will redirect to Guardian MFA setup
      const domain = process.env.AUTH0_ISSUER_BASE_URL?.replace('https://', '') || '';
      const enrollmentUrl = `https://${domain}/guardian/login?ticket=${ticket.data.ticket}`;
      
      console.log(`MFA enrollment ticket created for user ${userId}`);
      return enrollmentUrl;
    } catch (error) {
      console.error('Error generating MFA enrollment ticket:', error);
      // Fallback: return direct MFA URL
      const domain = process.env.AUTH0_ISSUER_BASE_URL?.replace('https://', '') || '';
      return `https://${domain}/guardian`;
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
