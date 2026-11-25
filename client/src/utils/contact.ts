export const GMAIL_PATTERN = /^[^\s@]+@gmail\.com$/i;
export const PHONE_PATTERN = /^(09\d{9}|\+639\d{9})$/;

export function isGmail(value: string) {
  return GMAIL_PATTERN.test(value.trim());
}

export function isPhMobile(value: string) {
  return PHONE_PATTERN.test(value.trim());
}

export function staffMayUseAnyEmail(role: string) {
  return role === "admin" || role === "superadmin";
}

export function contactFieldError(role: string, email: string, phone: string) {
  if (!staffMayUseAnyEmail(role) && !isGmail(email)) {
    return "Owners and tenants must use a Gmail address, like name@gmail.com.";
  }
  if (staffMayUseAnyEmail(role) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return "Enter a valid email address.";
  }
  if (!isPhMobile(phone)) {
    return "Use a Philippine mobile number: 09XXXXXXXXX or +639XXXXXXXXX.";
  }
  return "";
}
