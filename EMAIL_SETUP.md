# Email Setup Guide

Your contact form is now configured to send emails! Here's how to set it up:

## Option 1: Resend (Recommended)

Resend is a modern email API that's reliable and has a generous free tier.

### Setup Steps:

1. **Create a Resend account:**
   - Go to [resend.com](https://resend.com)
   - Sign up for a free account
   - The free tier includes 3,000 emails/month and 100 emails/day

2. **Get your API key:**
   - Go to [API Keys](https://resend.com/api-keys)
   - Create a new API key
   - Copy the key (starts with `re_`)

3. **Add to your environment:**
   - Copy `.env.example` to `.env.local`
   - Add your Resend API key:
     ```
     RESEND_API_KEY=re_your_actual_api_key_here
     ```

4. **Verify your domain (optional but recommended):**
   - Go to [Domains](https://resend.com/domains)
   - Add your domain and verify it
   - Update the `from` field in `/pages/api/contact.ts` to use your domain:
     ```typescript
     from: 'Contact Form <noreply@yourdomain.com>'
     ```

### Features:

✅ **What works now:**
- Contact form submissions send emails to `jedsmith2004@gmail.com`
- Beautiful HTML email formatting
- Reply-to functionality (you can reply directly to emails)
- Error handling and validation
- Professional email templates

✅ **Email includes:**
- Sender's name and email
- Full message content
- Timestamp
- Direct reply capability

## Testing

1. **Local testing:**
   ```bash
   npm run dev
   ```
   - Fill out the contact form
   - Check your email inbox

2. **Production testing:**
   - Deploy your site
   - Test the form from the live site

## Email Template

The emails you receive will include:
- **Subject:** "New Contact Form Message from [Name]"
- **From:** Your configured sender address
- **Reply-To:** The person who filled out the form
- **Content:** Nicely formatted HTML with all the details

## Troubleshooting

### Common Issues:

1. **"Email service not configured" error:**
   - Make sure `RESEND_API_KEY` is in your `.env.local` file
   - Restart your development server after adding environment variables

2. **Emails not sending:**
   - Check your API key is correct
   - Check the browser console for errors
   - Verify your Resend account is active

3. **Emails going to spam:**
   - Set up domain verification in Resend
   - Use a proper "from" address with your domain

### Environment Variables:

Create a `.env.local` file in your project root:

```bash
# Required for email functionality
RESEND_API_KEY=re_your_actual_key_here

# Your existing variables
GROQ_API_KEY=your_groq_key_here
```

## Alternative Options

If you prefer other email services, you can modify `/pages/api/contact.ts`:

- **EmailJS:** Good for client-side sending
- **SendGrid:** Enterprise-grade email service
- **Nodemailer:** Direct SMTP integration
- **Formspree:** Form handling service

## Security Notes

- API keys are server-side only (secure)
- Form validation prevents spam
- Rate limiting can be added if needed
- Email content is sanitized

## Support

If you need help:
1. Check the browser console for errors
2. Check your server logs
3. Verify your Resend dashboard for delivery status
4. Test with a simple message first

Your contact form is production-ready! 🚀
