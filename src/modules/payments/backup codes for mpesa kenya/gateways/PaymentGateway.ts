export interface PaymentGateway {
  initiate(phone: string, amount: number, reference: string): Promise<any>;
  verify(transactionId: string): Promise<any>;
  refund(transactionId: string, amount: number): Promise<any>;
}

export class MpesaGateway implements PaymentGateway {
  async initiate(phone: string, amount: number, reference: string): Promise<any> {
    return MpesaService.stkPush(phone, amount, reference);
  }
  
  async verify(transactionId: string): Promise<any> {
    // Implement M-Pesa query
    return MpesaService.queryStatus(transactionId);
  }
  
  async refund(transactionId: string, amount: number): Promise<any> {
    // Implement M-Pesa refund
    return MpesaService.refund(transactionId, amount);
  }
}

export class TigopesaGateway implements PaymentGateway {
  async initiate(phone: string, amount: number, reference: string): Promise<any> {
    // Tigo Pesa API integration
    // https://developer.tigopesa.co.tz/
    throw new Error("Tigo Pesa not yet implemented");
  }
  
  async verify(transactionId: string): Promise<any> {
    throw new Error("Not implemented");
  }
  
  async refund(transactionId: string, amount: number): Promise<any> {
    throw new Error("Not implemented");
  }
}

export class TipsGateway implements PaymentGateway {
  async initiate(phone: string, amount: number, reference: string): Promise<any> {
    // TIPS API integration
    // https://www.tips.co.tz/developer
    throw new Error("TIPS not yet implemented");
  }
  
  async verify(transactionId: string): Promise<any> {
    throw new Error("Not implemented");
  }
  
  async refund(transactionId: string, amount: number): Promise<any> {
    throw new Error("Not implemented");
  }
}

export class PaymentGatewayFactory {
  static getGateway(method: string): PaymentGateway {
    switch (method.toLowerCase()) {
      case 'mpesa':
        return new MpesaGateway();
      case 'tigo':
        return new TigopesaGateway();
      case 'tips':
        return new TipsGateway();
      default:
        throw new Error(`Unsupported payment method: ${method}`);
    }
  }
}