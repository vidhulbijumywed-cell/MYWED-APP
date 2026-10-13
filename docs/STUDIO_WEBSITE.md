# Mywed.in studio website

The wedding company landing page is independent of the business-management login.
Run `npm run dev` and open `http://localhost:3000/studio`.

`public/studio/index.html` is self-contained: it can also be opened directly in a
browser or hosted as a static website. It needs no database, npm dependencies,
external fonts, or third-party scripts. Deploy this directory as a separate site
to make the wedding company page the homepage of a public domain.

## Enquiries

The form collects bride and groom names and telephone numbers, optional email,
preferred contact, multiple events with dates/locations and per-event services,
album/digital preferences, optional budget, and notes. After validation, visitors
review the full enquiry before opening a prefilled WhatsApp message to
`+91 77365 99362`. They must press Send in WhatsApp; the website never claims a
message has been delivered. A plain-text download/copy option is provided.

No enquiry is stored in the app database, browser storage, or this repository.
To create an inbox with automatic email or CRM delivery, implement and configure
a server endpoint separately. Sending a WhatsApp enquiry does not book an event.

## Brand and photography

The typographic MWD treatment is inspired by the brand references shared in chat;
it is not the original logo file. Original photo/logo files were unavailable in
the filesystem. Drive and Instagram requests returned proxy-policy 403 errors.
The current design uses abstract artwork and links to the supplied Instagram
portfolio. It contains no stock/generated wedding photos, testimonials, invented
client names, or claimed awards.

To add approved original media, place optimized images in `public/studio/media/`
and populate `studioMedia` near the end of the HTML. Paths are relative, e.g.
`media/hero.jpg`. Supply accurate alt text and captions. Three or more photographs
activate the selected-work gallery; a hero photograph works independently. Use
only assets approved for public portfolio use. The Drive folder is:
https://drive.google.com/drive/folders/1o_a6WX5AW1xMe36QPcMH0DEBQ2IoFKSo

All visible phone links use the explicitly requested primary number. The second
number in the supplied logo is not used as a separate contact destination.

## Verification

TypeScript checks passed. Chromium verification covered the `/studio` redirect,
desktop and 390/320-pixel layouts, mobile menu, required phone validation,
per-event coverage validation, multiple-event addition/removal, safe text-only
summary output, correct WhatsApp destination and encoded enquiry contents,
download, and clearing the previous review when details change. The checks used
fictional contacts and did not send a WhatsApp message. Live WhatsApp delivery
and public hosting have not been verified.
