
export interface ReceiptItem {
  id: string;
  name: string;
  quantity: number;
  price: number; // Total price for this line item
}

export interface Participant {
  id: string;
  name: string;
}

export interface BillSession {
  id: string;
  createdAt: number; // Timestamp
  description?: string; // Optional user-added description or auto-generated
  receiptImage?: {
    dataUrl: string; // base64 encoded image
    mimeType: string;
  };
  extractedItems: ReceiptItem[];
  participants: Participant[];
  itemAssignments: { [itemId: string]: string | null }; // itemId -> participantId or null if unassigned
  taxAmount: number;
  serviceFeeAmount: number;
}

// This is what's actually stored, might include calculated totals for display in history
export interface StoredBillSession extends BillSession {
  calculatedShares?: ParticipantShare[]; // Optional: store the final calculation
}

export interface GeminiParsedResponseItem {
  name: string;
  quantity: number;
  price: number;
}
export interface GeminiParsedResponse {
  items: GeminiParsedResponseItem[];
  subtotal: number | null;
  tax: number | null;
  serviceFee: number | null;
  total: number | null;
}

export interface ParticipantShare {
  participantId: string;
  participantName: string;
  items: ReceiptItem[];
  subtotal: number;
  taxShare: number;
  serviceFeeShare: number;
  totalOwed: number;
}

export type AppStep = 'UPLOAD_RECEIPT' | 'EDIT_BILL_DETAILS' | 'VIEW_SUMMARY' | 'VIEW_HISTORY';
    