const mongoose = require("mongoose");

const ServiceSchema = new mongoose.Schema({
  provider_user_id: { type: String, required: true },
  name: { type: String, required: true },
  description: String,
  price: Number
}, { timestamps: true });

module.exports = mongoose.model("Service", ServiceSchema);
