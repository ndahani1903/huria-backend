export const normalizeTZPhone = (phone: string) => {
  let raw = phone.replace(/\D/g, "");

  if (raw.startsWith("0")) raw = raw.slice(1);

  if (raw.startsWith("255")) raw = raw.slice(3);

  if (!raw || !["6", "7"].includes(raw[0])) {
    throw new Error("Namba si sahihi");
  }

  if (raw.length !== 9) {
    throw new Error("Hakikisha hauanzi na sifuri baada ya +255");
  }

  return `+255${raw}`;
};