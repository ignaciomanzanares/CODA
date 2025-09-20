import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, CreditCard, Smartphone } from "lucide-react";

interface PaymentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  amount: string;
  participantName: string;
  billName: string;
  creatorName?: string;
  onPaymentComplete: () => void;
}

interface PaymentOption {
  id: string;
  name: string;
  icon: React.ReactNode;
  description: string;
  url: string;
  color: string;
  isPopular?: boolean;
}

export default function PaymentDialog({ 
  isOpen, 
  onClose, 
  amount, 
  participantName: _participantName, 
  billName,
  creatorName,
  onPaymentComplete 
}: PaymentDialogProps) {
  const [selectedPayment, setSelectedPayment] = useState<string | null>(null);

  const paymentOptions: PaymentOption[] = [
    {
      id: 'venmo',
      name: 'Venmo',
      icon: <Smartphone className="w-5 h-5" />,
      description: 'Quick mobile payments',
      url: `https://venmo.com/`,
      color: 'bg-blue-500 hover:bg-blue-600',
      isPopular: true
    },
    {
      id: 'paypal',
      name: 'PayPal',
      icon: <CreditCard className="w-5 h-5" />,
      description: 'Secure online payments',
      url: `https://www.paypal.com/paypalme/`,
      color: 'bg-blue-600 hover:bg-blue-700',
      isPopular: true
    },
    {
      id: 'zelle',
      name: 'Zelle',
      icon: <Smartphone className="w-5 h-5" />,
      description: 'Bank-to-bank transfer',
      url: `https://www.zellepay.com/`,
      color: 'bg-purple-500 hover:bg-purple-600'
    },
    {
      id: 'cashapp',
      name: 'Cash App',
      icon: <Smartphone className="w-5 h-5" />,
      description: 'Mobile payments',
      url: `https://cash.app/`,
      color: 'bg-green-500 hover:bg-green-600'
    },
    {
      id: 'apple-pay',
      name: 'Apple Pay',
      icon: <Smartphone className="w-5 h-5" />,
      description: 'Apple device payments',
      url: `https://www.apple.com/apple-pay/`,
      color: 'bg-gray-800 hover:bg-gray-900'
    },
    {
      id: 'google-pay',
      name: 'Google Pay',
      icon: <Smartphone className="w-5 h-5" />,
      description: 'Android payments',
      url: `https://pay.google.com/`,
      color: 'bg-red-500 hover:bg-red-600'
    }
  ];

  const handlePaymentClick = (option: PaymentOption) => {
    setSelectedPayment(option.id);
    // Open payment app/website
    window.open(option.url, '_blank');
  };

  const handleMarkAsPaid = () => {
    onPaymentComplete();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">
            💰 Pay Your Share
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Payment Summary */}
          <div className="bg-gray-50 p-4 rounded-lg text-center">
            <h3 className="font-semibold text-lg">{billName}</h3>
            <p className="text-gray-600 text-sm">
              {creatorName && `Requested by ${creatorName}`}
            </p>
            <div className="text-3xl font-bold text-green-600 mt-2">
              ${amount}
            </div>
            <p className="text-sm text-gray-500">
              Your share of the bill
            </p>
          </div>

          {/* Payment Options */}
          <div>
            <h4 className="font-medium mb-3 text-center">Choose your payment method:</h4>
            <div className="grid grid-cols-2 gap-3">
              {paymentOptions.map((option) => (
                <Button
                  key={option.id}
                  variant="outline"
                  className={`h-auto p-3 flex flex-col items-center gap-2 hover:scale-105 transition-transform ${
                    selectedPayment === option.id ? 'ring-2 ring-blue-500' : ''
                  }`}
                  onClick={() => handlePaymentClick(option)}
                >
                  <div className="flex items-center gap-2">
                    {option.icon}
                    <span className="font-medium">{option.name}</span>
                  </div>
                  {option.isPopular && (
                    <Badge variant="secondary" className="text-xs">
                      Popular
                    </Badge>
                  )}
                  <ExternalLink className="w-3 h-3 opacity-50" />
                </Button>
              ))}
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-blue-50 p-3 rounded-lg text-sm">
            <p className="text-blue-800 font-medium mb-1">How to pay:</p>
            <ol className="text-blue-700 space-y-1">
              <li>1. Choose a payment method above</li>
              <li>2. Send ${amount} to {creatorName || 'the bill creator'}</li>
              <li>3. Include &quot;{billName}&quot; in the memo/note</li>
              <li>4. Click &quot;I Paid&quot; below when done</li>
            </ol>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleMarkAsPaid}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              <CreditCard className="w-4 h-4 mr-2" />
              I Paid
            </Button>
          </div>

          <p className="text-xs text-gray-500 text-center">
            FinHealth doesn&apos;t process payments directly. You&apos;ll be redirected to your chosen payment app.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
