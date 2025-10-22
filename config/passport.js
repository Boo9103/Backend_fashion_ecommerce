const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const pool = require('./db');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
    passReqToCallback: false
}, async (accessToken, refreshToken, profile, done) => {
    // Profile từ Google: { id: '113456...', emails: [{value: 'user@example.com'}], displayName: 'User Name' }
    const googleId = profile.id;
    const email = profile.emails[0].value;
    const name = profile.displayName;

    try{
        //Kiểm tra user tồn tại bằng google_id hoặc email
        const userQuery = await pool.query(
            'SELECT * FROM users WHERE google_id = $1 OR email = $2',
            [googleId, email]
        );
        let user = userQuery.rows[0];

        if(!user){
            //Tạo user mới
            const newUser = await pool.query(
                'INSERT INTO users (google_id, email, name, created_at) VALUES ($1, $2, $3, NOW()) RETURNING *',
                [googleId, email, name]
            );
            user = newUser.rows[0];
        }else if (!user.google_id){
            //Cập nhật google_id nếu user tồn tại qua email
            await pool.query('UPDATE users SET google_id = $1 WHERE id = $2', [googleId, user.id]);
        }

        // Trả về user và token
        return done(null, user);
    }catch(err){
        return done(err, null);
    }
}));

module.exports = passport;