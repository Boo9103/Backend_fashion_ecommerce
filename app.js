const express = require('express');
const authRoutes = require('./routes/authRoutes');
const errorHandler = require('./utils/errorHandler');

const app = express();

//Middleware
app.use(express.json());

//Routes
app.use('/api/users', authRoutes);

//Error handling
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
})

