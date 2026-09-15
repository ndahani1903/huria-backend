export type PaymentStatus =
  | 'pending'
  | 'held'
  | 'released'
  | 'refunded'
  | 'failed';

export interface STKRequest {
  phone: string;
  amount: number;
  orderId: string;
}

export interface MpesaCallback {
  Body: {
    stkCallback: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number;
      CallbackMetadata?: {
        Item: { Name: string; Value: any }[];
      };
    };
  };
}