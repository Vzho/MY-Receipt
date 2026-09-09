# ResitAI Proposal Material Pack

Preview URL: https://c5b2d5d3.my-receipt.pages.dev

## 1. Executive Summary

ResitAI is a receipt intelligence platform for accounting and finance workflows.

It helps users upload receipts, extract key business information, review and correct the results, detect common issues, manage rejected receipts, identify duplicates, support E-invoice data, and export structured Excel files.

The system is designed to reduce manual data entry, improve review efficiency, and make receipt processing more structured and scalable.

## 2. Problems ResitAI Solves

Finance teams often face these problems when handling receipts manually:

- Receipt data is entered by hand, which is slow and error-prone.
- Receipt images may be blurry, faded, low contrast, or difficult to read.
- The same receipt may be uploaded more than once.
- Amounts may not match between line items, subtotal, tax, service charge, rounding, and grand total.
- Unclear or rejected receipts are difficult to track.
- Different businesses need different fields in the final export.
- E-invoice documents require additional fields such as TIN, UUID, QR payload, and validation information.
- Users want faster upload methods, including direct copy and paste.
- A system based only on direct vision-model API calls can become expensive and hard to control.

ResitAI addresses these issues with an OCR-first extraction workflow, AI-assisted enhancement, editable review, warnings, duplicate detection, rejected receipt management, E-invoice support, and Excel export.

## 3. Current System Capabilities

### 3.1 Receipt Upload

Users can upload receipts as JPEG, PNG, or PDF files.

PDF files can be converted into receipt images for OCR. Multi-page PDFs can be handled page by page or merged for review where appropriate.

### 3.2 Copy and Paste Upload

Users can copy a screenshot or image and paste it directly into the system with Ctrl + V.

This removes the need to save images locally before uploading.

### 3.3 OCR and AI Extraction

The default workflow starts with OCR-based parsing.

The system extracts key fields such as:

- Merchant name
- Invoice number
- Date and time
- Phone
- Company registration number
- Payment method
- Currency
- Subtotal
- Discount
- Service charge
- Tax or SST
- Rounding
- Grand total
- Line items
- Document type
- Category and tags

Users can edit extracted results before syncing or exporting.

### 3.4 Cost-Aware AI Enhancement

ResitAI is not simply a wrapper around a vision model API.

The system is designed to control cost by using OCR first. Additional AI enhancement is used selectively:

- DeepSeek text repair can improve structure and arithmetic from OCR text when repair is needed.
- Qwen VL vision parsing can be used when OCR text quality is poor and fallback is available.
- Smart parsing or vision re-parse can be manually triggered from the review page when a receipt needs higher-confidence processing.

This approach helps reduce unnecessary vision model calls and avoids turning the product into a simple API pass-through service.

### 3.5 Editable Review Interface

After parsing, users can review and edit extracted fields.

The receipt image is shown beside the editable fields so users can compare extracted data with the original image.

The image viewer supports:

- Smart view: focuses on the main receipt content.
- Amount view: focuses on totals and payment-related areas.
- Full view: shows the full receipt.

### 3.6 Warning Panel

The system highlights actionable problems through the Warning Panel.

Current warning types include:

- Blurry image
- OCR failed
- Poor OCR text
- Total mismatch
- Amount mismatch
- Missing required field
- Possible duplicate
- Not receipt or invalid file
- QR or E-invoice mismatch

The previous low-confidence field warning was removed from the main interface because it was too general and could not reliably point to a specific issue.

### 3.7 Duplicate Detection

The system helps detect duplicate receipt uploads.

It can use file hash, perceptual image similarity, and receipt business fields to identify likely duplicate receipts.

This reduces repeated processing and avoids duplicate accounting records.

### 3.8 Rejected Receipt Library

Deleted or rejected receipts are not immediately lost.

They are moved into a rejected receipt area where accounting users can review the reason and request customers to resubmit clearer or more complete photos.

This supports a better operational workflow for problematic receipts.

### 3.9 Custom Fields and Export Settings

Users can configure which fields should be shown and exported.

For example, if payment method is not required, it can be disabled so it does not appear in the review interface or exported columns.

This allows different businesses to adapt the output to their own accounting workflow.

### 3.10 Custom Document Types

The system supports standard document types and custom document types.

Examples:

- Receipt
- Invoice
- Credit Note
- Expense
- E-invoice
- Custom document type

### 3.11 E-invoice Support

The system supports E-invoice as a document type and includes E-invoice-specific fields:

- Supplier name
- Buyer name
- Supplier TIN
- Buyer TIN
- SST number
- Invoice UUID
- Validation link
- QR payload
- Invoice type
- Tax amount

E-invoice fields are shown only when relevant.

### 3.12 Excel Export

The export format is structured for accounting use:

- Receipts sheet: one receipt per row.
- Items sheet: one line item per row.

This separates receipt-level information from item-level detail and makes the exported file easier to process.

### 3.13 White and Low-Contrast Receipt Handling

The current workflow supports white thermal receipts and low-contrast receipt images through OCR, AI extraction, image quality warnings, and improved image review modes.

This is not a separate white-receipt-specific model. It means the current system can process and review white or faded receipts more effectively through the existing workflow.

### 3.14 Company Stamp Recognition

Company stamp recognition is not included in the current version.

The current sample set does not include clear receipts or documents with visible company stamps. If this feature is required, the client should provide several real samples with clear stamps so the feature can be evaluated and scoped properly.

## 4. Current Workflow

1. User uploads a receipt image, PDF, or pasted screenshot.
2. The file is validated and duplicate-checked.
3. The system creates a receipt record in Supabase.
4. OCR parsing starts in the background.
5. AI enhancement is used when needed or manually triggered.
6. The result appears in the review queue.
7. The user reviews the original image and extracted fields.
8. Warning Panel highlights issues that need attention.
9. The user edits fields, rejects the receipt, restores a rejected receipt, or confirms the result.
10. Data can be exported to Excel.

## 5. Architecture

### 5.1 Deployment Model

ResitAI uses a lightweight managed architecture:

- Frontend: React + Vite static web application
- Hosting: Cloudflare Pages
- Backend services: Supabase
- Database: Supabase Postgres
- Authentication: Supabase Auth
- File storage: Supabase Storage
- Server-side OCR and AI processing: Supabase Edge Functions

This means the system does not require a traditional self-managed backend server for the core product workflow.

### 5.2 Why This Architecture Matters

This architecture provides several advantages:

- Lower operational overhead
- Faster deployment
- Managed authentication and database
- Private receipt storage
- Protected OCR and AI API keys inside Edge Functions
- Easier scaling compared with a manually managed server
- Clear separation between frontend UI and secure backend processing

### 5.3 Data and Security Model

The frontend only uses public Supabase configuration.

Sensitive keys such as OCR, Qwen, DeepSeek, and service role keys are kept inside Supabase Edge Function secrets and are not exposed to the browser.

Receipt records and uploaded files are user-scoped through Supabase Auth, database policies, and private storage access.

## 6. Business Value

ResitAI can provide the following business value:

- Reduce manual receipt entry workload.
- Speed up receipt processing.
- Improve review accuracy.
- Reduce duplicated receipts.
- Catch amount mismatch and OCR issues earlier.
- Give accounting users a structured rejected receipt workflow.
- Support flexible field configuration.
- Support E-invoice-specific data.
- Produce cleaner Excel exports for downstream accounting work.
- Reduce AI processing cost through OCR-first parsing.
- Reduce deployment complexity through Cloudflare Pages and Supabase managed services.

## 7. Commercialization Potential

ResitAI has commercial potential as a receipt automation product for small and medium businesses, accounting firms, and finance teams.

Possible commercial models:

- Subscription per company or workspace
- Usage-based pricing by receipt volume
- Tiered plans based on OCR or AI usage limits
- Accounting firm plan for managing multiple clients
- Add-on pricing for E-invoice, advanced export templates, or API integrations

The system already has several foundations needed for commercialization:

- Web-based access
- User authentication
- Managed database and file storage
- Receipt processing workflow
- Warning and review system
- Exportable structured data
- Cost-aware AI pipeline
- Extensible document type and field configuration

Before full commercialization, the following areas should be strengthened:

- More real-world testing across different receipt types
- Clear pricing model around OCR and AI usage
- User role and team management
- Production monitoring and error reporting
- Better onboarding and help documentation
- More polished proposal/demo screenshots
- Data retention and privacy policy

## 8. Future Expansion Roadmap

### 8.1 Near-Term Enhancements

- Add more receipt samples for testing.
- Improve handling of blurry and low-contrast receipts.
- Add more accounting export templates.
- Improve E-invoice QR parsing and cross-check warnings.
- Add better onboarding messages for users.
- Add clearer quota and usage displays.

### 8.2 Medium-Term Enhancements

- Role-based access control for teams.
- Client or company workspace management.
- Audit log and change history for edited fields.
- More advanced duplicate detection.
- Batch review and bulk confirmation workflow.
- More industry-specific field profiles.

### 8.3 Long-Term Enhancements

- Company stamp recognition after sufficient sample data is provided.
- Integration with accounting systems such as AutoCount or SQL Accounting.
- API import and export endpoints.
- Webhook notifications for completed processing.
- Advanced analytics dashboard for receipt volume, exception rate, and processing efficiency.

## 9. Proposal Positioning

A useful positioning statement:

ResitAI is a cost-aware receipt automation platform that combines OCR, selective AI enhancement, editable human review, warning detection, duplicate detection, rejected receipt management, E-invoice support, and structured Excel export.

Unlike a simple vision model API wrapper, ResitAI is built as a workflow product. It helps users upload, verify, correct, manage, and export receipt data in a way that is practical for accounting operations.

