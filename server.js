// This 'require' line is how we import libraries in Node.js
const express = require('express');
const cors = require('cors'); // This allows your frontend to talk to your backend

// Create an instance of our express application
const app = express();
// Choreo will provide a PORT environment variable. For local testing, we'll use 8080.
const port = process.env.PORT || 8080; 

// --- Middleware Setup ---
// Middleware are functions that run for every request.

// Enable CORS (Cross-Origin Resource Sharing) for all requests.
// This is a security measure that browsers enforce. It's crucial for allowing your frontend
// (on a different domain) to make requests to this backend.
app.use(cors()); 

// Enable the express.json() middleware. 
// This allows our server to automatically parse incoming request bodies that are in JSON format.
app.use(express.json()); 

// --- In-Memory Database ---
// For this simple project, we are storing our data in a variable in memory.
// This means the data will reset every time the server restarts.
// In a real-world application, this would be a real database (like PostgreSQL, MongoDB, etc.).
let serviceOfferings = [
    { id: 's1', title: 'Gardening Services', description: 'Expert garden care, from lawn mowing to planting.', provider_user_id: 'serviceprovider@example.com' },
    { id: 's2', title: 'Plumbing Repairs', description: 'Fast and reliable leak repairs and installations.', provider_user_id: 'someotherprovider@example.com' }
];
let nextServiceId = 3; // A simple counter to ensure new services get a unique ID.

// --- API Endpoints (Routes) ---

// Define a GET endpoint to fetch ALL service offerings.
// This is what customers and admins will use to see all available services.
app.get('/api/services', (req, res) => {
    console.log('Request received for GET /api/services');
    // We send back the entire serviceOfferings array as a JSON response.
    res.json(serviceOfferings);
});

// Define a POST endpoint to CREATE a new service offering.
// This is what a service provider will use to add a new service.
app.post('/api/services', (req, res) => {
    console.log('Request received for POST /api/services');
    // We extract the title, description, and provider_user_id from the request body sent by the frontend.
    const { title, description, provider_user_id } = req.body; 

    // Basic validation: ensure we have the required data.
    if (!title || !description || !provider_user_id) {
        // If data is missing, send a 400 Bad Request error with a helpful message.
        return res.status(400).json({ message: 'Missing required fields: title, description, or provider_user_id' });
    }

    // Create a new service object with a unique ID.
    const newService = {
        id: `s${nextServiceId++}`, // e.g., 's3', 's4', etc.
        title,
        description,
        provider_user_id // IMPORTANT: In a real app, you would get this ID from the user's authenticated session, not trust the frontend.
    };

    // Add the new service to our "database".
    serviceOfferings.push(newService);
    console.log('New service added:', newService);

    // Send a 201 Created status and return the newly created service.
    res.status(201).json(newService);
});

// Define a PUT endpoint to UPDATE an existing service offering.
// The ':id' is a URL parameter, meaning it can be different for each request (e.g., /api/services/s1).
app.put('/api/services/:id', (req, res) => {
    // We get the specific service ID from the URL parameters.
    const serviceId = req.params.id;
    console.log(`Request received for PUT /api/services/${serviceId}`);
    
    // We get the updated data and the user's ID from the request body.
    const { title, description, provider_user_id } = req.body; 
    
    // Find the index of the service to update in our array.
    const serviceIndex = serviceOfferings.findIndex(s => s.id === serviceId);

    // If findIndex returns -1, the service wasn't found.
    if (serviceIndex === -1) {
        return res.status(404).json({ message: 'Service not found' });
    }

    // --- Authorization Check ---
    // IMPORTANT: Check if the user trying to edit the service is the actual owner.
    if (serviceOfferings[serviceIndex].provider_user_id !== provider_user_id) {
        // If the IDs don't match, send a 403 Forbidden error.
        return res.status(403).json({ message: 'Forbidden: You can only edit your own services.' });
    }

    // Update the service data.
    // We use the '||' operator as a shortcut: if a new value is provided, use it; otherwise, keep the old one.
    serviceOfferings[serviceIndex].title = title || serviceOfferings[serviceIndex].title;
    serviceOfferings[serviceIndex].description = description || serviceOfferings[serviceIndex].description;

    console.log('Service updated:', serviceOfferings[serviceIndex]);
    
    // Return the updated service object.
    res.json(serviceOfferings[serviceIndex]);
});

// --- Start the Server ---
// This tells our app to listen for incoming requests on the specified port.
app.listen(port, () => {
    console.log(`Backend server is running and listening on port ${port}`);
});
