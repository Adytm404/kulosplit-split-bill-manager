import React, { useState, useEffect, useCallback } from 'react';
import { AppStep, BillSession, Participant, ReceiptItem, StoredBillSession, GeminiParsedResponse, ParticipantShare } from './types';
import { DEFAULT_SERVICE_FEE_PERCENTAGE } from './constants';
import { analyzeReceiptWithGemini } from './services/geminiService';
import { loadBillsFromStorage, addBillToStorage, deleteBillFromStorage, clearAllBillsFromStorage } from './services/storageService';
import Spinner from './components/Spinner';
import { CameraIcon, UploadIcon, TrashIcon, PlusIcon, UserPlusIcon, ArrowLeftIcon, HistoryIcon, CheckCircleIcon, XCircleIcon, EditIcon, EyeIcon, WhatsAppIcon } from './components/icons';

// Helper function to generate unique IDs
const generateId = () => crypto.randomUUID();

// Helper function to format currency as IDR
const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const App: React.FC = () => {
  const [currentBill, setCurrentBill] = useState<BillSession | null>(null);
  const [appStep, setAppStep] = useState<AppStep>('UPLOAD_RECEIPT');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [historicalBills, setHistoricalBills] = useState<StoredBillSession[]>([]);
  const [participantNameInput, setParticipantNameInput] = useState<string>('');
  const [viewingBillDetails, setViewingBillDetails] = useState<StoredBillSession | null>(null);

  useEffect(() => {
    setHistoricalBills(loadBillsFromStorage());
    if (loadBillsFromStorage().length > 0) {
      setAppStep('UPLOAD_RECEIPT');
    }
  }, []);

  const clearMessages = () => {
    setErrorMessage('');
    setSuccessMessage('');
  };

  const handleImageUpload = async (file: File) => {
    clearMessages();
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please upload a valid image file.');
      return;
    }
    setIsLoading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Data = (reader.result as string).split(',')[1];
      const newBillId = generateId();
      setCurrentBill({
        id: newBillId,
        createdAt: Date.now(),
        receiptImage: { dataUrl: reader.result as string, mimeType: file.type }, // Store full data URL
        extractedItems: [],
        participants: [],
        itemAssignments: {},
        taxAmount: 0,
        serviceFeeAmount: 0,
        description: `Bill from ${new Date().toLocaleDateString()}`
      });

      try {
        const analysisResult = await analyzeReceiptWithGemini(base64Data, file.type);
        updateBillFromAnalysis(analysisResult, newBillId);
        setAppStep('EDIT_BILL_DETAILS');
        setSuccessMessage('Receipt analyzed successfully!');
      } catch (error) {
        console.error(error);
        setErrorMessage(error instanceof Error ? error.message : 'Failed to analyze receipt.');
        setAppStep('EDIT_BILL_DETAILS'); 
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const updateBillFromAnalysis = (analysis: GeminiParsedResponse, billId: string) => {
    setCurrentBill(prev => {
        const baseBill = prev || {
            id: billId,
            createdAt: Date.now(),
            participants: [],
            itemAssignments: {},
            description: `Bill from ${new Date().toLocaleDateString()}`,
            receiptImage: undefined, 
        };
        return {
            ...baseBill,
            extractedItems: analysis.items.map(item => ({ ...item, id: generateId() })),
            taxAmount: analysis.tax ?? 0,
            serviceFeeAmount: analysis.serviceFee ?? 0,
        };
    });
  };
  
  const handleAddParticipant = () => {
    clearMessages();
    if (!participantNameInput.trim() || !currentBill) return;
    if (currentBill.participants.find(p => p.name.toLowerCase() === participantNameInput.trim().toLowerCase())) {
        setErrorMessage('Participant with this name already exists.');
        return;
    }
    const newParticipant: Participant = { id: generateId(), name: participantNameInput.trim() };
    setCurrentBill({
      ...currentBill,
      participants: [...currentBill.participants, newParticipant],
    });
    setParticipantNameInput('');
  };

  const handleRemoveParticipant = (participantId: string) => {
    if (!currentBill) return;
    setCurrentBill({
      ...currentBill,
      participants: currentBill.participants.filter(p => p.id !== participantId),
      itemAssignments: Object.entries(currentBill.itemAssignments)
        .filter(([, pId]) => pId !== participantId)
        .reduce((acc, [itemId, pId]) => ({ ...acc, [itemId]: pId }), {}),
    });
  };

  const handleUpdateItem = (updatedItem: ReceiptItem) => {
    if (!currentBill) return;
    setCurrentBill({
      ...currentBill,
      extractedItems: currentBill.extractedItems.map(item => item.id === updatedItem.id ? updatedItem : item),
    });
  };

  const handleAddItem = () => {
    if (!currentBill) return;
    const newItem: ReceiptItem = { id: generateId(), name: 'New Item', quantity: 1, price: 0 };
    setCurrentBill({ ...currentBill, extractedItems: [...currentBill.extractedItems, newItem] });
  };

  const handleRemoveItem = (itemId: string) => {
    if (!currentBill) return;
    const newAssignments = { ...currentBill.itemAssignments };
    delete newAssignments[itemId];
    setCurrentBill({
      ...currentBill,
      extractedItems: currentBill.extractedItems.filter(item => item.id !== itemId),
      itemAssignments: newAssignments,
    });
  };

  const handleAssignItem = (itemId: string, participantId: string | null) => {
    if (!currentBill) return;
    setCurrentBill({
      ...currentBill,
      itemAssignments: { ...currentBill.itemAssignments, [itemId]: participantId },
    });
  };

  const handleUpdateTax = (amount: number) => {
    if (!currentBill) return;
    setCurrentBill({ ...currentBill, taxAmount: Math.max(0, amount) });
  };

  const handleUpdateServiceFee = (amount: number) => {
    if (!currentBill) return;
    setCurrentBill({ ...currentBill, serviceFeeAmount: Math.max(0, amount) });
  };
  
  const handleSetDefaultServiceFee = () => {
    if(!currentBill) return;
    const subtotal = currentBill.extractedItems.reduce((sum, item) => sum + item.price, 0);
    if (subtotal > 0) {
        handleUpdateServiceFee(subtotal * DEFAULT_SERVICE_FEE_PERCENTAGE);
    } else {
        setErrorMessage("Cannot calculate default service fee without items or non-zero prices.");
    }
  };

  const calculateShares = useCallback((): ParticipantShare[] => {
    if (!currentBill || currentBill.participants.length === 0) return [];

    const participantShares: ParticipantShare[] = currentBill.participants.map(p => ({
      participantId: p.id,
      participantName: p.name,
      items: [],
      subtotal: 0,
      taxShare: 0,
      serviceFeeShare: 0,
      totalOwed: 0,
    }));

    let totalBillSubtotal = 0;

    currentBill.extractedItems.forEach(item => {
      const itemLineTotal = item.price; 
      totalBillSubtotal += itemLineTotal;
      const assignedParticipantId = currentBill.itemAssignments[item.id];
      if (assignedParticipantId) {
        const share = participantShares.find(s => s.participantId === assignedParticipantId);
        if (share) {
          share.items.push(item);
          share.subtotal += itemLineTotal;
        }
      }
    });
    
    if (totalBillSubtotal === 0 && (currentBill.taxAmount > 0 || currentBill.serviceFeeAmount > 0)) {
        const numParticipants = currentBill.participants.length;
        if (numParticipants > 0) {
            participantShares.forEach(share => {
                share.taxShare = currentBill.taxAmount / numParticipants;
                share.serviceFeeShare = currentBill.serviceFeeAmount / numParticipants;
            });
        }
    } else if (totalBillSubtotal > 0) {
        participantShares.forEach(share => {
          const proportion = share.subtotal / totalBillSubtotal;
          share.taxShare = currentBill.taxAmount * proportion;
          share.serviceFeeShare = currentBill.serviceFeeAmount * proportion;
        });
    }

    participantShares.forEach(share => {
      share.totalOwed = share.subtotal + share.taxShare + share.serviceFeeShare;
    });

    return participantShares;
  }, [currentBill]);


  const handleViewSummary = () => {
    clearMessages();
    if (!currentBill ) {
        setErrorMessage("No bill data available.");
        return;
    }
    if (currentBill.participants.length === 0) {
      setErrorMessage("Please add participants before viewing summary.");
      return;
    }
    if (currentBill.extractedItems.length === 0) {
        setErrorMessage("Please add items to the bill.");
        return;
    }
    const unassignedItems = currentBill.extractedItems.filter(item => !currentBill.itemAssignments[item.id]);
    if (unassignedItems.length > 0 && currentBill.participants.length > 0) { // Only show error if there are participants to assign to
        setErrorMessage(`Please assign all items. ${unassignedItems.length} item(s) are unassigned.`);
        return;
    }
    setAppStep('VIEW_SUMMARY');
  };

  const handleSaveBill = () => {
    clearMessages();
    if (!currentBill) return;
    const finalShares = calculateShares();
    const billToSave: StoredBillSession = { ...currentBill, calculatedShares: finalShares };
    const updatedHistory = addBillToStorage(billToSave);
    setHistoricalBills(updatedHistory);
    setSuccessMessage('Bill saved successfully!');
    setCurrentBill(null);
    setAppStep('UPLOAD_RECEIPT');
  };

  const startNewBill = () => {
    clearMessages();
    setCurrentBill(null);
    setViewingBillDetails(null);
    setAppStep('UPLOAD_RECEIPT');
  };

  const viewBillFromHistory = (billId: string) => {
    clearMessages();
    const bill = historicalBills.find(b => b.id === billId);
    if (bill) {
      setViewingBillDetails(bill); 
      setAppStep('VIEW_SUMMARY'); 
    }
  };

  const handleDeleteBill = (billId: string) => {
    clearMessages();
    const updatedHistory = deleteBillFromStorage(billId);
    setHistoricalBills(updatedHistory);
    setSuccessMessage('Bill deleted.');
    if (viewingBillDetails?.id === billId) { 
        setViewingBillDetails(null);
        setAppStep('VIEW_HISTORY'); 
    }
  };

  const handleClearHistory = () => {
    clearMessages();
    if (window.confirm("Are you sure you want to delete all bill history? This cannot be undone.")) {
      const updatedHistory = clearAllBillsFromStorage();
      setHistoricalBills(updatedHistory);
      setSuccessMessage('All bill history cleared.');
      setAppStep('UPLOAD_RECEIPT'); 
    }
  };

  const generateWhatsAppMessage = (
    bill: StoredBillSession | BillSession, 
    shares: ParticipantShare[]
  ): string => {
    let message = `*KuloSplit Bill Summary*\n\n`;
    message += `🗓️ *Bill Date:* ${new Date(bill.createdAt).toLocaleDateString()}\n`;
    if (bill.description) {
      message += `📝 *Description:* ${bill.description}\n`;
    }
    message += `\n------------------------------\n\n`;

    shares.forEach(share => {
      message += `👤 *${share.participantName}* owes *${formatCurrency(share.totalOwed)}*\n`;
      if (share.items.length > 0) {
        message += `  Items:\n`;
        share.items.forEach(item => {
          message += `    - ${item.name} (x${item.quantity}): ${formatCurrency(item.price)}\n`;
        });
      } else {
        message += `  _No items assigned directly_\n`;
      }
      message += `  Subtotal: ${formatCurrency(share.subtotal)}\n`;
      message += `  Tax: ${formatCurrency(share.taxShare)}\n`;
      message += `  Service Fee: ${formatCurrency(share.serviceFeeShare)}\n\n`;
      message += `------------------------------\n\n`;
    });

    const totalBillAmount = shares.reduce((sum, share) => sum + share.totalOwed, 0);
    message += `💰 *Grand Total: ${formatCurrency(totalBillAmount)}*\n\n`;
    message += `Shared via KuloSplit`;

    return message;
  };

  const handleShareToWhatsApp = () => {
    const billToDisplay = viewingBillDetails || currentBill;
    if (!billToDisplay) {
      setErrorMessage("No bill data to share.");
      return;
    }
    const shares = viewingBillDetails?.calculatedShares || calculateShares();
    if (shares.length === 0) {
      setErrorMessage("No participant shares to display for sharing.");
      return;
    }

    const message = generateWhatsAppMessage(billToDisplay, shares);
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    setSuccessMessage("Bill details prepared for WhatsApp. If it didn't open, ensure WhatsApp is accessible.");
  };
  
  const renderHeader = () => (
    <header className="bg-sky-600 dark:bg-sky-800 text-white p-4 shadow-md sticky top-0 z-50">
      <div className="container mx-auto flex justify-between items-center">
        <h1 className="text-2xl font-bold">KuloSplit</h1>
        <nav className="flex items-center space-x-4">
          {(appStep !== 'UPLOAD_RECEIPT' || currentBill) && (
             <button
                onClick={startNewBill}
                className="text-white hover:text-sky-200 transition-colors"
                title="Start New Bill"
                aria-label="Start new bill"
              >
                <PlusIcon className="w-7 h-7" />
              </button>
          )}
          <button
            onClick={() => { clearMessages(); setAppStep('VIEW_HISTORY'); setViewingBillDetails(null); }}
            className="text-white hover:text-sky-200 transition-colors"
            title="View History"
            aria-label="View bill history"
          >
            <HistoryIcon className="w-7 h-7" />
          </button>
        </nav>
      </div>
    </header>
  );

  const renderMessages = () => (
    <>
      {errorMessage && (
        <div role="alert" className="my-4 p-3 bg-red-100 border border-red-400 text-red-700 dark:bg-red-900 dark:border-red-700 dark:text-red-200 rounded-md flex items-center justify-between">
          <span><XCircleIcon className="inline w-5 h-5 mr-2"/>{errorMessage}</span>
          <button onClick={() => setErrorMessage('')} className="font-bold text-red-700 dark:text-red-200" aria-label="Dismiss error message">&times;</button>
        </div>
      )}
      {successMessage && (
        <div role="alert" className="my-4 p-3 bg-green-100 border border-green-400 text-green-700 dark:bg-green-900 dark:border-green-700 dark:text-green-200 rounded-md flex items-center justify-between">
           <span><CheckCircleIcon className="inline w-5 h-5 mr-2"/>{successMessage}</span>
           <button onClick={() => setSuccessMessage('')} className="font-bold text-green-700 dark:text-green-200" aria-label="Dismiss success message">&times;</button>
        </div>
      )}
    </>
  );

  const renderUploadReceiptStep = () => (
    <div className="max-w-2xl mx-auto p-6 bg-white dark:bg-slate-800 shadow-xl rounded-lg">
      <h2 className="text-2xl font-semibold mb-6 text-center text-slate-700 dark:text-slate-200">Upload or Capture Receipt</h2>
      {renderMessages()}
      <div className="space-y-4">
        <div>
          <label htmlFor="receipt-upload" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Upload receipt image</label>
          <input
            id="receipt-upload"
            type="file"
            accept="image/*"
            onChange={(e) => e.target.files && e.target.files[0] && handleImageUpload(e.target.files[0])}
            className="block w-full text-sm text-slate-500 dark:text-slate-400
              file:mr-4 file:py-2 file:px-4
              file:rounded-full file:border-0
              file:text-sm file:font-semibold
              file:bg-sky-50 dark:file:bg-sky-700 file:text-sky-700 dark:file:text-sky-100
              hover:file:bg-sky-100 dark:hover:file:bg-sky-600 transition-colors cursor-pointer"
              aria-describedby="upload-help-text"
          />
           <p id="upload-help-text" className="mt-1 text-xs text-slate-500 dark:text-slate-400">Select an image file from your device.</p>
        </div>
        <div className="text-center my-2 text-sm text-slate-500 dark:text-slate-400">OR</div>
        <div>
          <label htmlFor="receipt-capture" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Capture with camera</label>
          <input
            id="receipt-capture"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => e.target.files && e.target.files[0] && handleImageUpload(e.target.files[0])}
            className="block w-full text-sm text-slate-500 dark:text-slate-400
            file:mr-4 file:py-2 file:px-4
            file:rounded-full file:border-0
            file:text-sm file:font-semibold
            file:bg-emerald-50 dark:file:bg-emerald-700 file:text-emerald-700 dark:file:text-emerald-100
            hover:file:bg-emerald-100 dark:hover:file:bg-emerald-600 transition-colors cursor-pointer"
            aria-describedby="capture-help-text"
          />
           <p id="capture-help-text" className="mt-1 text-xs text-slate-500 dark:text-slate-400">Use your device's camera to take a photo of the receipt.</p>
        </div>
      </div>
       {currentBill?.receiptImage?.dataUrl && (
          <div className="mt-6">
            <h3 className="text-lg font-medium mb-2 text-slate-700 dark:text-slate-200">Receipt Preview:</h3>
            <img src={currentBill.receiptImage.dataUrl} alt="Receipt preview" className="max-w-full h-auto max-h-96 rounded-md border border-slate-300 dark:border-slate-700 object-contain"/>
          </div>
        )}
    </div>
  );

  const renderEditBillDetailsStep = () => {
    if (!currentBill) return <p className="text-center text-red-500">Error: No bill data to edit.</p>;

    return (
      <div className="max-w-4xl mx-auto p-6 bg-white dark:bg-slate-800 shadow-xl rounded-lg">
        <div className="flex justify-between items-center mb-6">
            <button onClick={() => setAppStep('UPLOAD_RECEIPT')} className="flex items-center text-sky-600 dark:text-sky-400 hover:underline">
                <ArrowLeftIcon className="mr-2 w-5 h-5" /> Back to Upload
            </button>
            <h2 className="text-2xl font-semibold text-slate-700 dark:text-slate-200">Edit Bill Details</h2>
            <div></div> {/* Spacer */}
        </div>
        {renderMessages()}
        
        {currentBill.receiptImage?.dataUrl && (
          <div className="mb-6">
            <h3 className="text-lg font-medium mb-2 text-slate-700 dark:text-slate-200">Receipt Image:</h3>
            <img src={currentBill.receiptImage.dataUrl} alt="Receipt" className="max-w-xs h-auto rounded-md border border-slate-300 dark:border-slate-700 object-contain"/>
          </div>
        )}

        {/* Participants */}
        <div className="mb-8 p-4 border border-slate-200 dark:border-slate-700 rounded-md">
          <h3 className="text-xl font-semibold mb-3 text-slate-700 dark:text-slate-200">Participants</h3>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={participantNameInput}
              onChange={(e) => setParticipantNameInput(e.target.value)}
              placeholder="New participant name"
              className="flex-grow p-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-sky-500 focus:border-sky-500 dark:bg-slate-700 dark:text-slate-100"
              aria-label="New participant name"
            />
            <button onClick={handleAddParticipant} className="bg-sky-500 hover:bg-sky-600 text-white font-semibold py-2 px-4 rounded-md flex items-center transition-colors">
              <UserPlusIcon className="mr-2 w-5 h-5" /> Add
            </button>
          </div>
          <ul className="space-y-2">
            {currentBill.participants.map(p => (
              <li key={p.id} className="flex justify-between items-center p-2 bg-slate-50 dark:bg-slate-700 rounded-md">
                <span className="text-slate-800 dark:text-slate-100">{p.name}</span>
                <button onClick={() => handleRemoveParticipant(p.id)} className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors" aria-label={`Remove participant ${p.name}`}>
                  <TrashIcon />
                </button>
              </li>
            ))}
          </ul>
          {currentBill.participants.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No participants added yet.</p>}
        </div>

        {/* Items */}
        <div className="mb-8 p-4 border border-slate-200 dark:border-slate-700 rounded-md">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-xl font-semibold text-slate-700 dark:text-slate-200">Items</h3>
            <button onClick={handleAddItem} className="bg-green-500 hover:bg-green-600 text-white font-semibold py-1 px-3 rounded-md flex items-center text-sm transition-colors">
              <PlusIcon className="mr-1 w-4 h-4" /> Add Item
            </button>
          </div>
          <div className="space-y-3">
            {currentBill.extractedItems.map((item, index) => (
              <div key={item.id} className="p-3 bg-slate-50 dark:bg-slate-700 rounded-md shadow-sm grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                <input
                  type="text"
                  value={item.name}
                  onChange={(e) => handleUpdateItem({ ...item, name: e.target.value })}
                  placeholder="Item name"
                  className="md:col-span-4 p-2 border border-slate-300 dark:border-slate-600 rounded-md dark:bg-slate-800 dark:text-slate-100"
                  aria-label={`Item ${index + 1} name`}
                />
                <div className="md:col-span-2 flex items-center">
                  <label htmlFor={`item-qty-${item.id}`} className="sr-only">Quantity for {item.name}</label>
                  <span className="mr-1 text-sm text-slate-600 dark:text-slate-300 self-center">Qty:</span>
                  <input
                    id={`item-qty-${item.id}`}
                    type="number"
                    value={item.quantity}
                    onChange={(e) => handleUpdateItem({ ...item, quantity: parseInt(e.target.value) || 1 })}
                    min="1"
                    className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md dark:bg-slate-800 dark:text-slate-100"
                    aria-label={`Item ${index + 1} quantity`}
                  />
                </div>
                <div className="md:col-span-2 flex items-center">
                   <label htmlFor={`item-price-${item.id}`} className="sr-only">Price for {item.name}</label>
                   <span className="mr-1 text-sm text-slate-600 dark:text-slate-300 self-center">Price:</span>
                  <input
                    id={`item-price-${item.id}`}
                    type="number"
                    value={item.price}
                    onChange={(e) => handleUpdateItem({ ...item, price: parseFloat(e.target.value) || 0 })}
                    step="1" min="0"
                    className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md dark:bg-slate-800 dark:text-slate-100"
                    aria-label={`Item ${index + 1} price`}
                  />
                </div>
                <label htmlFor={`item-assign-${item.id}`} className="sr-only">Assign {item.name} to participant</label>
                <select
                  id={`item-assign-${item.id}`}
                  value={currentBill.itemAssignments[item.id] || ''}
                  onChange={(e) => handleAssignItem(item.id, e.target.value || null)}
                  disabled={currentBill.participants.length === 0}
                  className="md:col-span-3 p-2 border border-slate-300 dark:border-slate-600 rounded-md dark:bg-slate-800 dark:text-slate-100 disabled:opacity-50"
                  aria-label={`Item ${index + 1} assignment`}
                >
                  <option value="">Unassigned</option>
                  {currentBill.participants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button onClick={() => handleRemoveItem(item.id)} className="md:col-span-1 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 p-2 flex justify-center transition-colors" aria-label={`Remove item ${item.name}`}>
                  <TrashIcon />
                </button>
              </div>
            ))}
          </div>
          {currentBill.extractedItems.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No items added or extracted yet.</p>}
        </div>
        
        {/* Tax and Service Fee */}
        <div className="grid md:grid-cols-2 gap-6 mb-8 p-4 border border-slate-200 dark:border-slate-700 rounded-md">
          <div>
            <label htmlFor="taxAmount" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Tax Amount</label>
            <input
              id="taxAmount"
              type="number"
              value={currentBill.taxAmount}
              onChange={(e) => handleUpdateTax(parseFloat(e.target.value) || 0)}
              step="1" min="0"
              className="mt-1 block w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:ring-sky-500 focus:border-sky-500 dark:bg-slate-700 dark:text-slate-100"
            />
          </div>
          <div>
            <label htmlFor="serviceFeeAmount" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Service Fee Amount</label>
            <div className="flex items-center gap-2">
                <input
                id="serviceFeeAmount"
                type="number"
                value={currentBill.serviceFeeAmount}
                onChange={(e) => handleUpdateServiceFee(parseFloat(e.target.value) || 0)}
                step="1" min="0"
                className="mt-1 block w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:ring-sky-500 focus:border-sky-500 dark:bg-slate-700 dark:text-slate-100"
                />
                 <button 
                    onClick={handleSetDefaultServiceFee} 
                    title={`Set to ${DEFAULT_SERVICE_FEE_PERCENTAGE*100}% of item total`}
                    className="mt-1 text-xs bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 p-2 rounded-md whitespace-nowrap">
                    Set {DEFAULT_SERVICE_FEE_PERCENTAGE*100}%
                </button>
            </div>
          </div>
        </div>

        <div className="text-center">
          <button onClick={handleViewSummary} className="bg-sky-600 hover:bg-sky-700 text-white font-bold py-3 px-6 rounded-lg shadow-md hover:shadow-lg transition-all transform hover:scale-105">
            View Summary & Split
          </button>
        </div>
      </div>
    );
  };

  const renderSummaryStep = () => {
    const billToDisplay = viewingBillDetails || currentBill; 
    if (!billToDisplay) return <p className="text-center text-red-500">Error: No bill data for summary.</p>;

    const shares = viewingBillDetails?.calculatedShares || calculateShares(); 
    const totalBillAmount = shares.reduce((sum, share) => sum + share.totalOwed, 0);

    return (
      <div className="max-w-3xl mx-auto p-6 bg-white dark:bg-slate-800 shadow-xl rounded-lg">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-2">
            <button 
                onClick={() => {
                    if (viewingBillDetails) {
                        setViewingBillDetails(null);
                        setAppStep('VIEW_HISTORY');
                    } else {
                        setAppStep('EDIT_BILL_DETAILS');
                    }
                }} 
                className="flex items-center text-sky-600 dark:text-sky-400 hover:underline self-start sm:self-center"
            >
                <ArrowLeftIcon className="mr-2 w-5 h-5" /> Back
            </button>
            <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-100 order-first sm:order-none text-center">Bill Summary</h2>
            <div className="flex space-x-2 self-end sm:self-center">
                {!viewingBillDetails && ( 
                    <button 
                        onClick={handleSaveBill} 
                        className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-3 rounded-md flex items-center transition-colors text-sm"
                        title="Save Bill"
                    >
                        <CheckCircleIcon className="mr-1 sm:mr-2 w-5 h-5"/> <span className="hidden sm:inline">Save</span>
                    </button>
                )}
                 <button 
                    onClick={handleShareToWhatsApp}
                    className="bg-sky-500 hover:bg-sky-600 text-white font-semibold py-2 px-3 rounded-md flex items-center transition-colors text-sm"
                    title="Share on WhatsApp"
                >
                    <WhatsAppIcon className="mr-1 sm:mr-2 w-5 h-5 text-white"/> <span className="hidden sm:inline">Share</span>
                </button>
            </div>
        </div>
        {renderMessages()}

        {billToDisplay.receiptImage?.dataUrl && (
          <div className="mb-4">
            <img src={billToDisplay.receiptImage.dataUrl} alt="Receipt" className="max-w-xs mx-auto h-auto rounded-md border border-slate-300 dark:border-slate-700 object-contain mb-2"/>
          </div>
        )}
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-1">Bill Date: {new Date(billToDisplay.createdAt).toLocaleString()}</p>
        {billToDisplay.description && <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">Description: {billToDisplay.description}</p>}


        <div className="space-y-6">
          {shares.map(share => (
            <div key={share.participantId} className="p-4 bg-slate-50 dark:bg-slate-700 rounded-lg shadow">
              <h3 className="text-xl font-semibold text-sky-700 dark:text-sky-300 mb-2">{share.participantName}</h3>
              <ul className="list-disc list-inside pl-2 mb-2 text-sm text-slate-600 dark:text-slate-300">
                {share.items.map(item => (
                  <li key={item.id}>{item.name} (x{item.quantity}): {formatCurrency(item.price)}</li>
                ))}
              </ul>
              {share.items.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400 italic">No items assigned directly.</p>}
              <p className="text-sm">Subtotal: <span className="font-medium">{formatCurrency(share.subtotal)}</span></p>
              <p className="text-sm">Tax Share: <span className="font-medium">{formatCurrency(share.taxShare)}</span></p>
              <p className="text-sm">Service Fee Share: <span className="font-medium">{formatCurrency(share.serviceFeeShare)}</span></p>
              <p className="text-lg font-bold mt-1 text-slate-800 dark:text-slate-100">Total Owed: {formatCurrency(share.totalOwed)}</p>
            </div>
          ))}
        </div>
        {shares.length === 0 && <p className="text-slate-600 dark:text-slate-300">No participants or items to display.</p>}
        
        <div className="mt-8 pt-4 border-t border-slate-300 dark:border-slate-600 text-right">
            <p className="text-sm text-slate-600 dark:text-slate-300">Original Tax: {formatCurrency(billToDisplay.taxAmount)}</p>
            <p className="text-sm text-slate-600 dark:text-slate-300">Original Service Fee: {formatCurrency(billToDisplay.serviceFeeAmount)}</p>
            <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">Grand Total: {formatCurrency(totalBillAmount)}</p>
        </div>

        {!viewingBillDetails && (
            <div className="mt-8 text-center">
                <button onClick={startNewBill} className="bg-sky-500 hover:bg-sky-600 text-white font-semibold py-2 px-6 rounded-md transition-colors">
                    Start New Bill
                </button>
            </div>
        )}
      </div>
    );
  };

  const renderHistoryStep = () => (
    <div className="max-w-3xl mx-auto p-6 bg-white dark:bg-slate-800 shadow-xl rounded-lg">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">Bill History</h2>
        {historicalBills.length > 0 && (
          <button onClick={handleClearHistory} className="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-md flex items-center text-sm transition-colors">
            <TrashIcon className="mr-1 w-4 h-4"/> Clear All History
          </button>
        )}
      </div>
      {renderMessages()}
      {historicalBills.length === 0 ? (
        <p className="text-slate-600 dark:text-slate-300 text-center py-8">No saved bills yet. Start by uploading a receipt!</p>
      ) : (
        <ul className="space-y-4">
          {historicalBills.map(bill => {
            const total = bill.calculatedShares?.reduce((sum, s) => sum + s.totalOwed, 0) || 
                          (bill.extractedItems.reduce((s, i) => s + i.price,0) + bill.taxAmount + bill.serviceFeeAmount);
            return (
            <li key={bill.id} className="p-4 bg-slate-50 dark:bg-slate-700 rounded-lg shadow-md hover:shadow-lg transition-shadow">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
                <div>
                  <p className="font-semibold text-lg text-sky-700 dark:text-sky-300">{bill.description || `Bill from ${new Date(bill.createdAt).toLocaleDateString()}`}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {new Date(bill.createdAt).toLocaleString()} - {bill.participants.length} participant(s) - Total: {formatCurrency(total)}
                  </p>
                </div>
                <div className="mt-3 sm:mt-0 flex space-x-2">
                  <button
                    onClick={() => viewBillFromHistory(bill.id)}
                    className="text-sky-600 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-200 p-2 rounded-md bg-sky-100 dark:bg-sky-700 hover:bg-sky-200 dark:hover:bg-sky-600 transition-colors" title="View Details"
                    aria-label={`View details for bill from ${new Date(bill.createdAt).toLocaleDateString()}`}
                  >
                    <EyeIcon className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleDeleteBill(bill.id)}
                    className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 p-2 rounded-md bg-red-100 dark:bg-red-700 hover:bg-red-200 dark:hover:bg-red-600 transition-colors" title="Delete Bill"
                     aria-label={`Delete bill from ${new Date(bill.createdAt).toLocaleDateString()}`}
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </li>
          )})}
        </ul>
      )}
       <div className="mt-8 text-center">
          <button onClick={startNewBill} className="bg-sky-500 hover:bg-sky-600 text-white font-semibold py-2 px-6 rounded-md transition-colors">
              <PlusIcon className="inline w-5 h-5 mr-2" /> Start New Bill
          </button>
        </div>
    </div>
  );

  const renderCurrentStep = () => {
    if (isLoading) {
      return <div className="flex justify-center items-center h-64"><Spinner message="Processing..." size="lg" /></div>;
    }
    switch (appStep) {
      case 'UPLOAD_RECEIPT':
        return renderUploadReceiptStep();
      case 'EDIT_BILL_DETAILS':
        return renderEditBillDetailsStep();
      case 'VIEW_SUMMARY':
        return renderSummaryStep();
      case 'VIEW_HISTORY':
        return renderHistoryStep();
      default:
        setAppStep('UPLOAD_RECEIPT'); // Fallback to a known state
        return renderUploadReceiptStep();
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex flex-col">
      {renderHeader()}
      <main className="container mx-auto p-4 sm:p-6 lg:p-8 flex-grow">
        {renderCurrentStep()}
      </main>
      <footer className="text-center p-4 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700">
        KuloSplit Bill Manager &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
};

export default App;