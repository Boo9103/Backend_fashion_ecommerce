const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const SHOP_NAME = process.env.SHOP_NAME || process.env.EMAIL_FROM_NAME || 'HS Fashion';
const DEFAULT_FROM = process.env.EMAIL_FROM || `${SHOP_NAME} <${process.env.EMAIL_USER}>`;

const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
});

// sendOtpEmail: dùng DEFAULT_FROM
const sendOtpEmail = async (to, otp)=> {
    let template = fs.readFileSync(path.join(__dirname, '../templates/otpEmailTemplate.html'), 'utf-8');
    template = template.replace('{{OTP}}', otp);
    await transporter.sendMail({
        from: DEFAULT_FROM,
        to: to,
        subject: 'Xác thực email đăng ký ' + SHOP_NAME,
        html: template,
    });
};

// sendResetPasswordEmail: dùng DEFAULT_FROM
const sendResetPasswordEmail = async (to, otp) => {
  let template = fs.readFileSync(path.join(__dirname, '../templates/resetPasswordTemplate.html'), 'utf-8');
  template = template.replace('{{OTP}}', otp);

  await transporter.sendMail({
    from: DEFAULT_FROM,
    to,
    subject: `Mã xác nhận đặt lại mật khẩu - ${SHOP_NAME}`,
    html: template,
  });
};

// sendDeliveredOrderEmail: dùng DEFAULT_FROM
const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'deliveredOrderTemplate.html');

const sendDeliveredOrderEmail = async (to, orderDetails) => {
  try {
    let html;
    if (fs.existsSync(TEMPLATE_PATH)) {
      let tpl = fs.readFileSync(TEMPLATE_PATH, 'utf8');
      tpl = tpl.replace(/{{\s*ORDER_ID\s*}}/g, orderDetails.id || '')
               .replace(/{{\s*USER_NAME\s*}}/g, orderDetails.user_name || '')
               .replace(/{{\s*DELIVERY_DATE\s*}}/g, orderDetails.updated_at ? new Date(orderDetails.updated_at).toLocaleString('vi-VN') : '')
               .replace(/{{{\s*ORDER_SUMMARY\s*}}}/g, orderDetails.order_summary_html || '')
               .replace(/{{\s*ORDER_SUMMARY\s*}}/g, orderDetails.order_summary_html || '')
               .replace(/{{\s*ORDER_TOTAL\s*}}/g, orderDetails.total_display || '')
               .replace(/{{\s*FE_ORDER_URL\s*}}/g, orderDetails.fe_order_url || process.env.FE_URL || '')
               .replace(/{{\s*FE_URL\s*}}/g, process.env.FE_URL || '');
      html = tpl;
    } else {
      html = `<p>Xin chào ${orderDetails.user_name || ''},</p>
              <p>Đơn hàng <strong>${orderDetails.id}</strong> đã được giao vào <strong>${orderDetails.updated_at || ''}</strong>.</p>
              ${orderDetails.order_summary_html || ''}
              <p><strong>Tổng: ${orderDetails.total_display || ''}</strong></p>`;
    }

    const mailOptions = {
      from: DEFAULT_FROM,
      to,
      subject: `Đơn hàng ${orderDetails.id} đã được giao`,
      html
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (err) {
    console.error('[email.sendDeliveredOrderEmail] error', err && err.stack ? err.stack : err);
    throw err;
  }
};

module.exports = { sendOtpEmail, sendResetPasswordEmail, sendDeliveredOrderEmail, DEFAULT_FROM, SHOP_NAME };
