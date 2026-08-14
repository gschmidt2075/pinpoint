// ── FEMA published equipment rates ───────────────────────────────────────────
// Used when billing a disaster back to FEMA under force account. Reference
// data, so it lives here rather than inside a screen — Cost Accounting needs it
// as much as the Equipment module does.

export const FEMA_EQUIPMENT_RATES = [
  { type:"Motor Grader",        size:"100-149 HP",  rate:112.00 },
  { type:"Motor Grader",        size:"150-199 HP",  rate:130.00 },
  { type:"Dozer",               size:"100-149 HP",  rate:98.00  },
  { type:"Backhoe / Excavator", size:"1.0-1.5 CY",  rate:89.00  },
  { type:"Backhoe / Excavator", size:"1.5-2.0 CY",  rate:108.00 },
  { type:"Dump Truck",          size:"10-14 CY",    rate:52.00  },
  { type:"Dump Truck",          size:"15-20 CY",    rate:68.00  },
  { type:"Tandem Dump Truck",   size:"14-18 CY",    rate:65.00  },
  { type:"Side Dump Trailer",   size:"20+ CY",      rate:48.00  },
  { type:"Pickup Truck",        size:"1/2 - 1 ton", rate:28.00  },
  { type:"Loader",              size:"2.0-2.5 CY",  rate:95.00  },
  { type:"Loader",              size:"2.5-3.5 CY",  rate:115.00 },
  { type:"Skid Steer",          size:"< 1 CY",      rate:42.00  },
  { type:"Tractor",             size:"50-99 HP",    rate:38.00  },
  { type:"Mower (Rotary)",      size:"Tractor mtd", rate:32.00  },
  { type:"Crack Sealer",        size:"Trailer",     rate:45.00  },
  { type:"Roller / Compactor",  size:"10-12 ton",   rate:58.00  },
  { type:"Water Truck",         size:"2000+ gal",   rate:48.00  },
  { type:"Chip Spreader",       size:"Self prop",   rate:88.00  },
  { type:"Paver",               size:"Asphalt",     rate:125.00 },
  { type:"Sign Truck / Bucket", size:"1 ton",       rate:55.00  },
  { type:"Generator",           size:"< 25 KW",     rate:14.00  },
  { type:"Trailer (Flatbed)",   size:"< 20 ton",    rate:18.00  },
];
