const dataStore = require("../data-store");
const logger = require("../logger");

const schema = {
  name: "ammo_vs_armor",
  description:
    "Find the best ammo to penetrate a given armor class in Tarkov. Returns ammo name and penetration values as spoken text.",
  parameters: {
    type: "object",
    properties: {
      armor_class: {
        type: "integer",
        description: "Armor class 1 through 6",
      },
      caliber: {
        type: "string",
        description: "Optional caliber filter, e.g. Caliber556x45NATO",
      },
    },
    required: ["armor_class"],
  },
};

async function handler(args) {
  const armorClass = args.armor_class;
  const caliber = args.caliber || null;
  logger.debug(`[tool:ammo_vs_armor] armor_class=${armorClass} caliber=${caliber}`);

  const { rows, caveat } = dataStore.getAmmoForClass(armorClass, caliber);
  logger.debug(`[tool:ammo_vs_armor] found=${rows.length} caveat=${caveat}`);

  if (rows.length === 0) {
    return `No ammo data found${caliber ? ` for caliber ${caliber}` : ""}.`;
  }

  const parts = rows.map(
    (r) => `${r.short_name || r.name} with penetration ${r.penetration_power}`
  );

  if (caveat) {
    return (
      `No ammo reliably penetrates class ${armorClass}. Best available: ` +
      parts.join(", ") +
      "."
    );
  }

  if (parts.length === 1) {
    return `For class ${armorClass} armor, use ${parts[0]}.`;
  }

  const last = parts.pop();
  return `For class ${armorClass} armor: ${parts.join(", ")}, and ${last}.`;
}

module.exports = { schema, handler };
