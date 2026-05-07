export function normalizeTZPhone(input: string | undefined | null): string {
   // ✅ Add validation first
  if (!input || typeof input !== 'string') {
    throw new Error("Phone number is required");
  }

  let phone = input.replace(/\s+/g, "").trim();

  if (phone.startsWith("+255")) {
    phone = phone.slice(4);
  } else if (phone.startsWith("255")) {
    phone = phone.slice(3);
  } else if (phone.startsWith("0")) {
    phone = phone.slice(1);
  }

  if (!/^[67]\d{8}$/.test(phone)) {
    throw new Error("Invalid Tanzania phone number");
  }

  return `+255${phone}`;
}