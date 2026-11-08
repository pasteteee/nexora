import { Caveat, Golos_Text, JetBrains_Mono, Literata } from "next/font/google";

/* Page faces from the editor design: headings, text, formulas/code, handwritten headings of two themes. */
const literata = Literata({ subsets: ["latin", "cyrillic"], variable: "--font-literata", display: "swap" });
const golos = Golos_Text({ subsets: ["latin", "cyrillic"], variable: "--font-golos", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin", "cyrillic"], variable: "--font-jetbrains", display: "swap" });
const caveat = Caveat({ subsets: ["latin", "cyrillic"], variable: "--font-caveat", display: "swap" });

export const boardFonts = [literata.variable, golos.variable, mono.variable, caveat.variable].join(" ");
