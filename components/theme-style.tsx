import { getBusiness } from "@/lib/business";
import { isDefault, readTheme, themeVars } from "@/lib/theme";

// THE SHOP'S COLOURS on every page: a small <style> that replaces the colour
// variables from globals.css (Settings → Appearance). Default colours → nothing to add.
export async function ThemeStyle() {
    const business = await getBusiness();
    const theme = readTheme(business?.theme);
    if (isDefault(theme)) return null;
    const css = Object.entries(themeVars(theme))
        .map(([k, v]) => `${k}:${v};`)
        .join("");
    return <style>{`:root{${css}}`}</style>;
}
