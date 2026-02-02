import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface WhatsAppFABProps {
  phoneNumber?: string;
  message?: string;
  className?: string;
}

export function WhatsAppFAB({ 
  phoneNumber = "601xxxxxxxx", 
  message = "Hi! I need help with Arasa A+ platform.",
  className 
}: WhatsAppFABProps) {
  const handleClick = () => {
    const encodedMessage = encodeURIComponent(message);
    const waUrl = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;
    window.open(waUrl, "_blank");
  };

  return (
    <Button
      onClick={handleClick}
      className={cn(
        "fixed bottom-24 right-4 md:bottom-6 z-50 w-14 h-14 rounded-full shadow-lg",
        "bg-green-500 hover:bg-green-600 text-white",
        "transition-transform hover:scale-110 active:scale-95",
        className
      )}
      size="icon"
      aria-label="Contact us on WhatsApp"
    >
      <MessageCircle className="w-6 h-6" fill="currentColor" />
    </Button>
  );
}
