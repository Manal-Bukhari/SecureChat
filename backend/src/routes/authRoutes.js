const express = require('express');
const router = express.Router();
const { router: signupRouter } = require('../controllers/authController');
const signinRouter = require('../controllers/signinController');

// Signup route
router.use('/', signupRouter);

// Signin/Login route
router.use('/', signinRouter);

module.exports = router;

