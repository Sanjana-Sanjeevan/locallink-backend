const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

const { auth, requiredScopes } = require('express-oauth2-jwt-bearer');
const Service = require('./models/Service');

const app = express();
const PORT = process.env.PORT || 3001;

// --- MongoDB Connection ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// --- JWT Middleware ---
const jwtCheck = auth({
  issuer: 'https://api.eu.asgardeo.io/t/locallink1/oauth2/token',
  audience: 'YAL1gx453cfZ2acg240aCyDmgOEa',
  jwksUri: 'https://api.eu.asgardeo.io/t/locallink1/oauth2/jwks'
});

// --- Middleware ---
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

// --- Other endpoints remain unchanged ---
// --- Update Profile via SCIM2 ---
app.patch('/api/profile', jwtCheck, async (req, res) => {
  const accessToken = req.headers.authorization?.split(' ')[1];
  const orgName = 'locallink1';
  const { givenName, familyName, email, phone_number } = req.body;

  const updateData = {
    Operations: [
      {
        op: "replace",
        value: {
          name: { givenName, familyName },
          emails: [{ value: email, type: "home", primary: true }],
          phoneNumbers: [{ value: phone_number, type: "mobile" }]
        }
      }
    ],
    schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"]
  };

  try {
    const response = await axios.patch(
      `https://api.eu.asgardeo.io/t/${orgName}/scim2/Me`,
      updateData,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );
    res.status(200).json({ message: "Profile updated", data: response.data });
  } catch (err) {
    console.error("SCIM2 update failed:", err.response?.data || err.message);
    const statusCode = err.response?.status || 500;
    res.status(statusCode).json({
      message: "Failed to update profile",
      error: err.response?.data || err.message
    });
  }
});

// --- Get Current User Profile from Asgardeo via SCIM2 ---
app.get('/api/profile', jwtCheck, async (req, res) => {
  const accessToken = req.headers.authorization?.split(' ')[1];
  const orgName = 'locallink1';

  try {
    const response = await axios.get(
      `https://api.eu.asgardeo.io/t/${orgName}/scim2/Me`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        }
      }
    );

    res.status(200).json({ data: response.data });
  } catch (err) {
    console.error("SCIM2 GET failed:", err.response?.data || err.message);
    const statusCode = err.response?.status || 500;
    res.status(statusCode).json({
      message: "Failed to fetch profile",
      error: err.response?.data || err.message
    });
  }
});


// --- Public: Get All Services ---
app.get('/api/services', async (req, res) => {
  try {
    const services = await Service.find();
    res.json(services);
  } catch (err) {
    console.error('Failed to fetch services:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// --- Provider: Get Own Services ---
app.get('/api/my-services', jwtCheck, requiredScopes('services:write'), async (req, res) => {
  const user_id = req.auth.payload.sub;
  try {
    const services = await Service.find({ provider_user_id: user_id });
    res.json(services);
  } catch (err) {
    console.error('Failed to fetch provider services:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// --- Provider: Create Service ---
app.post('/api/services', jwtCheck, requiredScopes('services:write'), async (req, res) => {
  const provider_user_id = req.auth.payload.sub;
  const { name, description, price } = req.body;

  if (!name || !description || !price) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const newService = new Service({ provider_user_id, name, description, price });
    await newService.save();
    res.status(201).json(newService);
  } catch (err) {
    console.error('Error creating service:', err);
    res.status(500).json({ message: 'Failed to create service' });
  }
});

// --- Provider: Update Service ---
app.put('/api/services/:id', jwtCheck, requiredScopes('services:write'), async (req, res) => {
  const user_id = req.auth.payload.sub;
  const { id } = req.params;

  try {
    const service = await Service.findById(id);
    if (!service) return res.status(404).json({ message: 'Service not found' });
    if (service.provider_user_id !== user_id) {
      return res.status(403).json({ message: 'Forbidden: You do not own this service' });
    }

    Object.assign(service, req.body);
    await service.save();
    res.json(service);
  } catch (err) {
    console.error('Error updating service:', err);
    res.status(500).json({ message: 'Failed to update service' });
  }
});

// --- Provider: Delete Service ---
app.delete('/api/services/:id', jwtCheck, requiredScopes('services:write'), async (req, res) => {
  const user_id = req.auth.payload.sub;
  const { id } = req.params;

  try {
    const service = await Service.findById(id);
    if (!service) return res.status(404).json({ message: 'Service not found' });
    if (service.provider_user_id !== user_id) {
      return res.status(403).json({ message: 'Forbidden: You do not own this service' });
    }

    await Service.findByIdAndDelete(id);
    res.json({ message: 'Service deleted successfully' });
  } catch (err) {
    console.error('Error deleting service:', err);
    res.status(500).json({ message: 'Failed to delete service' });
  }
});
    
// --- Admin: Get Customers + Providers with Services ---
app.get('/api/admin-data', jwtCheck, requiredScopes('admin:read'), async (req, res) => {
  const accessToken = req.headers.authorization?.split(' ')[1];
  const orgName = 'locallink1';

  try {
    const userRes = await axios.get(`https://api.eu.asgardeo.io/t/${orgName}/scim2/Users`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    console.log("🟢 SCIM2 response data:", JSON.stringify(userRes.data, null, 2));

    const allUsers = userRes.data?.Resources || [];
    const allServices = await Service.find();

    // Log users and their groups for debugging
    allUsers.forEach(u => {
      const groups = (u.groups || []).map(g => g.display || '').join(', ');
      console.log(`User: ${u.userName} - Groups: ${groups}`);
    });

    // Case-insensitive filtering for group display names
    const customers = allUsers
      .filter(u =>
        u.groups?.some(g => g.display?.toLowerCase().includes('customer'))
      )
      .map(u => ({
        id: u.id,
        givenName: u.name?.givenName,
        familyName: u.name?.familyName,
        email:
          u.emails?.[0] ||
          u['urn:scim:wso2:schema']?.emailAddresses?.[0] ||
          'N/A'
      }));

    const providers = allUsers
      .filter(u =>
        u.groups?.some(g => g.display?.toLowerCase().includes('service_provider'))
      )
      .map(u => {
        const services = allServices.filter(s => s.provider_user_id === u.id);
        return {
          id: u.id,
          givenName: u.name?.givenName,
          familyName: u.name?.familyName,
          email:
            u.emails?.[0] ||
            u['urn:scim:wso2:schema']?.emailAddresses?.[0] ||
            'N/A',
          services
        };
      });

    res.json({ customers, providers });
  } catch (err) {
    console.error("Admin data fetch failed:", err.response?.data || err.message);
    const statusCode = err.response?.status || 500;
    res.status(statusCode).json({
      message: "Failed to fetch admin data",
      error: err.response?.data || err.message
    });
  }
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`🚀 LocalLink backend running at http://localhost:${PORT}`);
});
