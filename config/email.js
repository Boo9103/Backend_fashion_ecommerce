const fs = require('fs');
const path = require('path');
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
  const fs = require('fs');
  const path = require('path');
  let template = fs.readFileSync(path.join(__dirname, '../templates/resetPasswordTemplate.html'), 'utf-8');
  template = template.replace('{{OTP}}', otp);

  await transporter.sendMail({
    from: `HS Fashion <${process.env.EMAIL_USER}>`,
    to,
    subject: 'Mã xác nhận đặt lại mật khẩu - HS Fashion',
    html: template,
  });
};

// ensure path points to repo templates folder
const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'deliveredOrderTemplate.html');

const sendDeliveredOrderEmail = async (to, orderDetails) => {
  try {
    let html;
    if (fs.existsSync(TEMPLATE_PATH)) {
      let tpl = fs.readFileSync(TEMPLATE_PATH, 'utf8');

      // replace common placeholders (support both triple and double braces)
      tpl = tpl.replace(/{{\s*ORDER_ID\s*}}/g, orderDetails.id || '')
               .replace(/{{\s*USER_NAME\s*}}/g, orderDetails.user_name || '')
               .replace(/{{\s*DELIVERY_DATE\s*}}/g, orderDetails.updated_at ? new Date(orderDetails.updated_at).toLocaleString('vi-VN') : '')
               // handle both {{{ORDER_SUMMARY}}} and {{ORDER_SUMMARY}}
               .replace(/{{{\s*ORDER_SUMMARY\s*}}}/g, orderDetails.order_summary_html || '')
               .replace(/{{\s*ORDER_SUMMARY\s*}}/g, orderDetails.order_summary_html || '')
               .replace(/{{\s*ORDER_TOTAL\s*}}/g, orderDetails.total_display || '')
               .replace(/{{\s*FE_ORDER_URL\s*}}/g, orderDetails.fe_order_url || process.env.FE_URL || '')
               .replace(/{{\s*FE_URL\s*}}/g, process.env.FE_URL || '');

      html = tpl;
    } else {
      console.warn('[email] deliveredOrderTemplate.html not found, using fallback:', TEMPLATE_PATH);
      html = `<p>Xin chào ${orderDetails.user_name || ''},</p>
              <p>Đơn hàng <strong>${orderDetails.id}</strong> đã được giao vào <strong>${orderDetails.updated_at || ''}</strong>.</p>
              ${orderDetails.order_summary_html || ''}
              <p><strong>Tổng: ${orderDetails.total_display || ''}</strong></p>`;
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
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

module.exports = { sendOtpEmail, sendResetPasswordEmail, sendDeliveredOrderEmail };
