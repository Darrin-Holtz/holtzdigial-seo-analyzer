import jwt from 'jsonwebtoken';

const auth = (req, res, next) => {
    try {
        // Prefer httpOnly cookie; fall back to Bearer header for API clients
        const token = req.cookies?.auth_token ||
            (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null);

        if (!token) {
            return res.status(401).json({ success: false, message: 'Unauthorized, no token provided' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.id;
        next();
    } catch (error) {
        console.error('Authentication error:', error.message);
        res.status(401).json({ success: false, message: 'Unauthorized, invalid token' });
    }
};

export default auth;