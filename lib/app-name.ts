// home-screen labels get cut off after ~12 letters: "Kopi & Co." stays, longer names lose words
export function shortName(name: string) {
  if (name.length <= 12) return name;
  const words = name.split(" ");
  let out = words[0];
  for (const w of words.slice(1)) {
    if ((out + " " + w).length > 12) break;
    out += " " + w;
  }
  return out.slice(0, 12);
}
