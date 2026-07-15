const mongoose = require('mongoose');

// Umumiy kalit-qiymat sozlamalar (hozircha: bosh sahifa hero konfiguratsiyasi).
// Hero avval admin brauzerining localStorage'ida saqlanardi — boshqa
// qurilmalarda ko'rinmasdi. Endi barcha tashrifchilar bir xil hero'ni ko'radi.
const settingSchema = new mongoose.Schema(
  {
    key:   { type: String, required: true, unique: true, trim: true },
    value: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Setting', settingSchema);
