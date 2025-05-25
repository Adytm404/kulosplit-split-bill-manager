
import { StoredBillSession } from '../types';
import { LOCAL_STORAGE_BILLS_KEY } from '../constants';

export const loadBillsFromStorage = (): StoredBillSession[] => {
  try {
    const storedBills = localStorage.getItem(LOCAL_STORAGE_BILLS_KEY);
    if (storedBills) {
      return JSON.parse(storedBills) as StoredBillSession[];
    }
  } catch (error) {
    console.error("Failed to load bills from local storage:", error);
  }
  return [];
};

export const saveBillsToStorage = (bills: StoredBillSession[]): void => {
  try {
    localStorage.setItem(LOCAL_STORAGE_BILLS_KEY, JSON.stringify(bills));
  } catch (error) {
    console.error("Failed to save bills to local storage:", error);
  }
};

export const addBillToStorage = (bill: StoredBillSession): StoredBillSession[] => {
  const bills = loadBillsFromStorage();
  const updatedBills = [bill, ...bills]; // Add new bill to the beginning
  saveBillsToStorage(updatedBills);
  return updatedBills;
};

export const deleteBillFromStorage = (billId: string): StoredBillSession[] => {
  const bills = loadBillsFromStorage();
  const updatedBills = bills.filter(b => b.id !== billId);
  saveBillsToStorage(updatedBills);
  return updatedBills;
};

export const clearAllBillsFromStorage = (): StoredBillSession[] => {
  saveBillsToStorage([]);
  return [];
};
    