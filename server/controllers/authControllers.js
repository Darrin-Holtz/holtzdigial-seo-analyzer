import User from '../models/User.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const IS_PROD = process.env.NODE_ENV === 'production';
const COOKIE_OPTIONS = {
    httpOnly: true,           // not accessible via JS — prevents XSS token theft
    secure: IS_PROD,          // HTTPS only in production
    sameSite: IS_PROD ? 'strict' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: '/',
};

//Generate JWT
const generateToken = (id) => {
  return jwt.sign({id}, process.env.JWT_SECRET, {expiresIn: '30d'});
}

//Register User
export const register = async (req, res) => {
  try {
    const {name, email, password} = req.body;
    
    if(!name || !email || !password) return res.status(400).json({success: false, message: 'All fields are required'});
    // Check if user already exists
    const existingUser = await User.findOne({email});
    if(existingUser) return res.status(400).json({success: false, message: 'User already exists'});

    //Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    //Create user
    const user = await User.create({name, email, password: hashedPassword});
    const token = generateToken(user._id);

    res.cookie('auth_token', token, COOKIE_OPTIONS);
    res.status(201).json({success: true, user});
  } catch (error) {
    console.error('Error registering user:', error.message);
    res.status(500).json({success: false, message: 'Server error'});
  }
}

//Login User
export const login = async (req, res) => {
  try {
    const {email, password} = req.body;
    
    if(!email || !password) return res.status(400).json({success: false, message: 'All fields are required'});
    // Check if user exists
    const existingUser = await User.findOne({email});
    if(!existingUser) return res.status(400).json({success: false, message: 'Invalid credentials'});

    //Check password
    const isPasswordCorrect = await bcrypt.compare(password, existingUser.password);
    if(!isPasswordCorrect) return res.status(400).json({success: false, message: 'Invalid credentials'});

    const token = generateToken(existingUser._id);

    res.cookie('auth_token', token, COOKIE_OPTIONS);
    res.status(200).json({success: true, user: existingUser});
  } catch (error) {
    console.error('Error logging in user:', error.message);
    res.status(500).json({success: false, message: 'Server error'});
  }
}

//Logout
export const logout = (req, res) => {
    res.clearCookie('auth_token', { path: '/' });
    res.json({ success: true, message: 'Logged out' });
};

//Get current user
export const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if(!user) return res.status(404).json({success: false, message: 'User not found'});

    // Reset daily analysis count if the last analysis was on a previous calendar day
    if (user.plan !== 'pro' && user.analysisCount > 0) {
      const today = new Date().toDateString();
      const lastDate = user.lastAnalysisDate ? new Date(user.lastAnalysisDate).toDateString() : null;
      if (lastDate !== today) {
        user.analysisCount = 0;
        await user.save();
      }
    }

    res.status(200).json({success: true, user});
  } catch (error) {
    console.error('Error fetching current user:', error.message);
    res.status(500).json({success: false, message: 'Server error'});
  }
}