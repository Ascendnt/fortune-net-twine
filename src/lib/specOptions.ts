// Item-specification option lists, sourced from the export description-flow reference sheet
// ("1st selection" through "8th selection"). The original discovery doc frames item building as
// Category -> Material -> Net Type -> Knots -> Selvages -> Stretching -> Reinforcement -> Others ->
// Color -> UOM, auto-generating a descriptive spec string, rather than picking from a fixed catalog
// row. These lists back that flow: ItemSelectionModal composes a selection from each category into
// the specification sentence that heads a batch item, and the item's Material + Net Type then
// filter which specification codes the Add Specification picker offers.
//
// Each category is an independent, deduplicated pick-list rather than a nested per-material tree.
// The source sheet's "Nth selection" header names a sequence of choices, not a hierarchy.

/**
 * Explicit "nothing here" choice, offered on every optional specification field.
 *
 * Leaving a field untouched and choosing "-" mean the same thing to the composed string, but they
 * do not mean the same thing to the person filling the form: a blank reads as unfinished, while a
 * dash reads as decided. It is stored rather than collapsed to "" so the distinction survives, and
 * buildSpecString drops it.
 */
export const SPEC_NONE = "-";

// First selection in the Item Selection flow (doc §3.3). Narrows what the rest of the sheet is
// describing before any material is chosen.
export const SPEC_CATEGORIES = ["NET", "SPORTS NET", "TWINE"];

export const SPEC_MATERIALS = ["Nylon", "HDPE", "Hi-Ex", "Polyester", "HTPE"] as const;

export const SPEC_NET_TYPES = [
  "Braided Net",
  "Twisted Net",
  "Mono Net",
  "Twisted Mono (Mozuku Net)",
  "Raschel Knotless Net",
  "Raschel Superknotless Net",
  "Twisted Twine",
  "Braided Twine",
  "Mono Twine",
  "Mono Knotted Net",
  "Finished Sport Netting",
  "Finished Sport Netting: Volleyball Net",
  "Finished Sport Netting: Football Cages",
  "Finished Sport Netting: Tennis Net",
  "Braided Rope",
  "Braided Net, DM Nets w/ Core (4x1500D Twisted)",
  "Braided DM Twine w/ Core (4x1500D Twisted)",
  "Knotless Net",
  "Knotless Net (Este Net)",
  "Prime Net",
  "Prime Twine",
];

export const SPEC_KNOTS = ["SK", "DK"];

export const SPEC_SELVAGES = [
  "DSTB",
  "DSTB (thicker 1.5MD selvage on top and bottom)",
  "DSTB (thicker 2MD selvage on top and bottom)",
  "DSTB (thicker 3MD selvage on top and bottom)",
  "DSTB (thicker 5MD selvage on top and bottom)",
  "DSTB (thicker selvage on top and bottom)",
  "DSTB (thicker selvage on top and bottom), longer selvage on top only (Method B)",
  "DSTB (thicker selvage on top and bottom) with nylon braided twine 210/6x16, longer selvage on top only (Method A)",
  "DSTB (thicker selvage on top and bottom) with nylon braided twine 210/8x16, longer selvage on top only (Method A)",
  "DSTB 2 meshes with thicker twine 210/15",
  "DSTB 2 meshes with thicker twine 210/18",
  "DSTB 210/6 connected to single 210/9",
  "DSTB 3 meshes, 4 ply",
  "DSTB 3 meshes with thicker twine 210/12",
  "DSTB double selvage on top only",
  "DSTB on bottom only, longer selvage of 4cm on top only",
  "DSTB one full mesh",
  "DSTB one full mesh on top only",
  "LSTB",
  "NLSTB",
  "SSTB",
  "SSTB 2.5MD thicker twine with nylon 36 ply twine",
  "SSTB 2.5MD thicker twine with nylon 45 ply twine",
  "SSTB 2.5MD thicker twine with nylon 60 ply twine",
  "SSTB 2.5MD thicker twine with nylon 90 ply twine",
  "SSTB 2.5MD thicker twine with nylon 108 ply twine",
  "SSTB 2.5MD thicker twine with nylon 120 ply twine",
  "SSTB 2.5MD thicker twine with nylon braided twine #36 (210/6x16) on top & bottom",
  "SSTB 2.5MD thicker twine with nylon braided twine #42 (210/8x16) on top & bottom",
  "SSTB with last 2 meshes at bottom using 210/12x16",
  "SSTB with nylon braided twine 210/6x16, longer selvage on top only",
  "SSTB with nylon braided twine 210/6x16 on top and bottom",
  "SSTB with nylon braided twine 210/9x16 on top only",
];

export const SPEC_STRETCHING = ["DWS", "LWS"];

export const SPEC_REINFORCEMENT = [
  "No reinforcement",
  "Reinforced 2.5MD by 210/48, every 30MD",
  "Reinforced 2.5MD by 210/54, every 30MD",
  "Reinforced 2.5MD by bigger twine, every 40MD",
  "Reinforced 2.5MD by bigger twine, every 45MD",
  "Reinforced 2.5MD by bigger twine, every 48MD",
  "Reinforced by 210/12 thicker twine, 3 meshes every 100 meshes",
  "Reinforced by 210/15 thicker twine, 3 meshes every 100 meshes",
  "Reinforced by 210/18 thicker twine, 3 meshes every 100 meshes",
  "Reinforced by 210/18 thicker twine, 5 meshes every 100 meshes",
  "Reinforced by 210/21 thicker twine, 5 meshes every 100 meshes",
  "Reinforced by thicker twine, 2.5 meshes every 100 meshes",
  "Reinforced by thicker twine, 3 meshes every 100 meshes",
  "Reinforced by thicker twine, 3 meshes every 125 meshes",
  "Reinforced by thicker twine, 3 meshes every 65 meshes",
  "Reinforcement 3 meshes thicker twine at every 100MD & the selvages on top & bottom",
  "Two reinforcements of 2.5MD by bigger twine, at 30MD from each border",
];

export const SPEC_OTHERS = [
  "No heat treatment or hot water",
  "In plastic bobbins",
  "In paper tube",
  "Cut in square",
  "Cut in square meshes / deer nets",
  "Cut in square meshes after depthway stretching",
  "Cut in square meshes after lengthway stretching",
  "Cut to hang square (bar)",
  "No shuttle junction knot",
  "No mending knot",
  "All (minimum) repaired mending knot, burned",
  "All mending knot, burned",
  "All mending knot (very few), burned",
  "HS number 5608 11 19",
  "HS number 5607 4990",
  "HS number 9506",
  "FR treatment",
  "Folded singly per one piece inside plastic bag",
  "Folded inside plastic bag, label on long side corner",
  "Folded inside plastic bag, globe label on long side corner",
  "Folded inside plastic bag, Sorex label on long side corner",
  "Folded inside plastic bag with Ecopic notice, label tag (marked Ecopic) on long side corner",
  "Yellow tracer PE monofilament, yellow color",
  "One monofilament white color + one monofilament green color as core inside any braided twine",
  "Sewed on perimeter with red PE braided twine diam. 5mm (inside sewing)",
  "Normal PE braided twine diam. 5.0mm / composition: 550Dx6x16, 18 core (125mts/kg)",
  "PE braided twine diam. 2.50mm(3mm) / composition: 550Dx3x16, 10 core (260mts/kg)",
  "PE braided twine diam. 2.50mm / composition: 520Dx3x16, 4 core (300mts/kg)",
  "PE braided twine diam. 3.50mm(4mm) / composition: 520Dx3x8+520Dx4x8, 34 core (185mts/kg)",
  "PE braided twine diam. 4.0mm / composition: 520Dx5x16, 15 core (160mts/kg)",
  "PE braided twine diam. 5.0mm / composition: 550Dx6x16, 12 core (140mts/kg)",
  "New PE flat braided twine diam. 3.50mm / composition: 500Dx3x16, 6 core (301mts/kg)",
  "Hand bordered on perimeter, folded singly (per piece) inside plastic bag",
  "Hand bordered, PE border rope diam. 12mm on 2 length only",
  "Hand bordered, PE border rope diam. 12mm on perimeter with nylon thimble on corners",
  "Hand bordered on 2 length only",
  "On both width of nets, add 4.00mts of braided twine 5mm for testing",
  "5 players cage, 3.00mts PE braided twine, 6.50mts diam. 5mm",
  "Cage 6.20mts, PE braided twine 9.50mts diam. 5mm",
  "Cage 7.50mts, PE braided twine 10.50mts diam. 5mm",
  "Tennis body knotted nets / twisted twine",
  "Heat-setted in square meshes by using frame",
  "Twisted twine composition: 3x20x380Den. (340mts/kg)",
  "Braided twine composition: 520Dx3x8/520Dx4x8, 34 core (185mts/kg)",
  "Longer selvages, top & bottom",
  "Square mesh, braided knotted",
  "Square mesh, twisted knotted",
  "PE finished tubular net",
  "Middle-to-middle knot mesh measurement",
  "Center-center mesh measurement",
  "Inside mesh measurement",
  "Medium soft lay",
  "Medium lay",
  "Very hard laid",
  "Very tight knots",
  "7 full mesh joining on top & bottom",
  "Cod ends",
  "Hard resin (water 20:1 resin at 165°C)",
  "SB 3mm",
  "SB 4mm",
  "SB 5mm",
  "SB 8mm",
  "SB 9mm",
  "SB 10mm",
  "SB 12mm",
  "With border rope",
];

export const SPEC_COLORS = [
  "Black Color",
  "Black Dyed and Tarred",
  "Black Dyed and Dipped",
  "Black Dyed and Dipped (Water Based Resin)",
  "Black Dyed and Dipped 7%",
  "Black Dyed with Resin",
  "Black Dyed without Tar",
  "Black w/ Gold Tracer",
  "Black w/ Yellow Tracer",
  "Predyed Black and Tarred",
  "Predyed Black and Dipped (Water Based Resin)",
  "Predyed Only, No Tar",
  "FR Black + Red Tracer",
  "FR Black + 1 Red Tracer",
  "White Color",
  "White (Transparent) Color",
  "Clear Color",
  "Natural White Color",
  "Dyed White Color",
  "White with Black Tracer",
  "White & Black Color",
  "Snow White Color",
  "Snow White & Blue Color",
  "Snow White & Red No.1",
  "Green Color",
  "Green No.1",
  "Green No.5",
  "Green No.6",
  "Green RAL6004",
  "Green RAL6012",
  "Green with Resin",
  "Light Green Color",
  "Light Green No.3",
  "Very Light Green Color",
  "Parrot Green No.1",
  "Spring Green Color",
  "Dark Green Color",
  "Dark Green No.4",
  "Dark Green No.7",
  "Aqua Green No.1",
  "Tropical Green Pantone 18-4930TCX",
  "Fluorescent Yellow Green Color",
  "Blue Color",
  "Light Blue Color",
  "Light Blue No.1",
  "Blue with 1% Resin",
  "Very Light Blue Color",
  "Pantone Blue Color",
  "Pantone Blue No.1",
  "Dark Blue Color",
  "Dark Blue with 1% Resin",
  "Royal Blue Color",
  "Red Color",
  "Red No.1",
  "Light Red Color",
  "Orange Color",
  "Yellow Color",
  "Yellow w/ Blue Tracer",
  "Translucent Color",
  "Crystal (Translucent) Color",
  "Stone Color",
  "Brown Color",
  "Dark Brown Color",
  "Original Brown Color",
  "Reddish Brown Color",
  "Greenish Grey Color",
  "Smoke Grey Color",
];

/** Weight units are written singular: KG, not KGS. */
export const SPEC_WEIGHT_UNITS = ["KG", "LB"];

/** The unit the quoted QTY is expressed in. Nets ship by the piece, twine by spool, hank or coil. */
export const SPEC_QTY_UNITS = ["PCS", "SPOOLS", "HANKS", "COILS"];

export interface SpecSelection {
  category: string;
  material: string;
  netType: string;
  knots: string;
  selvages: string;
  stretching: string;
  reinforcement: string;
  others: string;
  color: string;
  weightUnit: string;
  qtyUnit: string;
}

export const EMPTY_SPEC_SELECTION: SpecSelection = {
  category: "",
  material: "",
  netType: "",
  knots: "",
  selvages: "",
  stretching: "",
  reinforcement: "",
  others: "",
  color: "",
  weightUnit: "KG",
  qtyUnit: "PCS",
};

// Joins whichever categories are actually picked, in the sheet's own "1st..8th selection" order.
// Every category is optional except Material. A spec with just a material and color is valid,
// matching how not every real item needs a knot/reinforcement/etc. called out.
//
// The reference app renders the result as one upper-cased sentence with no separators ("NYLON
// BRAIDED NET SK DSTB DOUBLE SELVAGE ON TOP ONLY DWS REINFORCED BY THICKER TWINE …"), so that is
// what this produces. The weight/quantity UOMs are deliberately excluded, because they are column
// headers on the item row, not part of the specification sentence.
export function buildSpecString(sel: SpecSelection): string {
  return [
    sel.material,
    sel.netType,
    sel.knots,
    sel.selvages,
    sel.stretching,
    sel.reinforcement,
    sel.others,
    sel.color,
  ]
    // SPEC_NONE is a deliberate "none", so it contributes nothing to the sentence.
    .filter((part) => Boolean(part) && part !== SPEC_NONE)
    .join(" ")
    .toUpperCase();
}
