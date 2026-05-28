"use client";

import { useCallback } from "react";
import { Phone } from "lucide-react";
import { useTelephony } from "@/lib/phone/telephony";
import { tokens } from "@/lib/ui/dialer-tokens";
import { formatAustralianPhoneDisplay } from "@/lib/phone/format-phone-display";
import { hapticSubmit } from "@/lib/phone/haptics";

interface MobileCallButtonProps {
  phoneNumber: string;
  contactLabel?: string;
  /** Triggered after the dial event is requested (used to start timer). */
  onCallPlaced?: () => void;
  /** Override the displayed phone number (defaults to AU-formatted phoneNumber). */
  displayPhone?: string;
  disabled?: boolean;
}

/**
 * Oversized green call button. Anchored at the bottom of the contact card or
 * action bar. Hands the dial event off to the telephony provider
 * (today: TelLinkProvider → OS dialer; future: WebRTC).
 *
 * Calls `navigator.vibrate(20)` for a light tap haptic on supported devices.
 */
export function MobileCallButton({
  phoneNumber,
  contactLabel,
  onCallPlaced,
  displayPhone,
  disabled,
}: MobileCallButtonProps) {
  const telephony = useTelephony();

  const handleClick = useCallback(async () => {
    hapticSubmit();
    // Fire the callback BEFORE awaiting placeCall. On mobile the OS hands off
    // to the Phone app mid-execution and may suspend this tab, preventing the
    // promise continuation from running. Transitioning the screen first means
    // the caller always sees the in-call UI when they return, regardless of
    // whether the JS was frozen during the handoff.
    onCallPlaced?.();
    try {
      await telephony.placeCall({
        phoneNumber,
        contactLabel,
        surface: "share_link",
      });
    } catch (err) {
      console.error("placeCall failed", err);
    }
  }, [telephony, phoneNumber, contactLabel, onCallPlaced]);

  const label = displayPhone ?? formatAustralianPhoneDisplay(phoneNumber) ?? phoneNumber;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || !phoneNumber}
      className={tokens.buttons.callPrimary}
      aria-label={`Call ${contactLabel ?? phoneNumber}`}
    >
      <Phone className="h-6 w-6" />
      <span>Call {label}</span>
    </button>
  );
}
