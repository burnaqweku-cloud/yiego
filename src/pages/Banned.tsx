import { ShieldAlert, Mail, Phone as PhoneIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

const WHATSAPP_SUPPORT = 'https://wa.me/233501234567?text=Hi%2C%20my%20access%20has%20been%20restricted.%20Please%20help.';
const SUPPORT_EMAIL = 'support@yiego.com';

const Banned = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <ShieldAlert className="w-8 h-8 text-destructive" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold font-display text-foreground">
            Your access has been restricted
          </h1>
          <p className="text-muted-foreground text-sm">
            Your account or device has been flagged for a policy violation.
            If you believe this is a mistake, please contact our support team.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild variant="default" className="gap-2">
            <a href={WHATSAPP_SUPPORT} target="_blank" rel="noopener noreferrer">
              <PhoneIcon className="w-4 h-4" />
              WhatsApp Support
            </a>
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <a href={`mailto:${SUPPORT_EMAIL}?subject=Access%20Restricted`}>
              <Mail className="w-4 h-4" />
              Email Support
            </a>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Reference your account email when contacting support for faster resolution.
        </p>
      </div>
    </div>
  );
};

export default Banned;
