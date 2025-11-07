const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
});

const sendOtpEmail = async (to, otp)=> {
    const fs = require('fs');
    const path = require('path');
    let template = fs.readFileSync(path.join(__dirname, '../templates/otpEmailTemplate.html'), 'utf-8');
    template = template.replace('{{OTP}}', otp); //Thay thế {{OTP}} trong template bằng mã OTP thực tế

    await transporter.sendMail({
        from: 'HS fashion <'+ process.env.EMAIL_USER + '>',
        to: to,
        subject: 'Xác thực email đăng ký HS fashion',
        html: template,
    });
};

// Gửi email OTP quên mật khẩu
const sendResetPasswordEmail = async (to, otp) => {
  let template = fs.readFileSync(path.join(__dirname, '../templates/resetPasswordTemplate.html'), 'utf-8');
  template = template.replace('{{OTP}}', otp);

  await transporter.sendMail({
    from: `HS Fashion <${process.env.EMAIL_USER}>`,
    to,
    subject: 'Mã xác nhận đặt lại mật khẩu - HS Fashion',
    html: template,
  });
};

module.exports = { sendOtpEmail, sendResetPasswordEmail };
