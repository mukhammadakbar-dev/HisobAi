export const SMS_PROVIDER = 'SMS_PROVIDER';

export interface SmsProvider {
  sendDueReminder(
    phone: string,
    customerName: string,
    amount: number,
    dueDate: Date,
  ): Promise<boolean>;
}
