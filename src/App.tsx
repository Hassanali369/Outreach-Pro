import React, { useState, useRef, useEffect } from 'react';
import Papa from 'papaparse';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { 
  Upload, Mail, Settings, Play, Pause, Square, CheckCircle, 
  AlertCircle, FileText, X, Eye, Plus, Trash2, Clock, Users, 
  LayoutTemplate, Activity, ChevronRight, Inbox, BarChart3, History, Download, ShieldAlert, Menu
} from 'lucide-react';
import { collection, addDoc, onSnapshot, query } from 'firebase/firestore';
import { db } from './firebase';

const quillModules = {
  toolbar: [
    [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
    [{ 'font': [] }],
    [{ 'size': ['small', false, 'large', 'huge'] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ 'color': [] }, { 'background': [] }],
    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
    [{ 'align': [] }],
    ['link', 'clean']
  ]
};

type Account = { id: string; email: string; password: string; name: string; dailyLimit: number; sentToday: number; };
type Template = { id: string; text: string; };
type Contact = Record<string, string>;
type Log = { id: string; time: Date; to: string; status: 'success' | 'error'; message: string; account?: string; };
type SentRecord = { id: string; email: string; sentAt: string; account: string; subject: string; };

export default function App() {
  const [unsubscribeEmail, setUnsubscribeEmail] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('unsubscribe');
    }
    return null;
  });
  const [unsubscribeStatus, setUnsubscribeStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    if (unsubscribeEmail && unsubscribeStatus === 'loading') {
      addDoc(collection(db, 'unsubscribes'), {
        email: unsubscribeEmail.toLowerCase().trim(),
        timestamp: Date.now()
      }).then(() => {
        setUnsubscribeStatus('success');
      }).catch((err) => {
        console.error('Error unsubscribing:', err);
        setUnsubscribeStatus('error');
      });
    }
  }, []);

  if (unsubscribeEmail) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 max-w-md w-full text-center">
          {unsubscribeStatus === 'loading' && (
            <div className="space-y-4">
              <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto"></div>
              <h2 className="text-xl font-bold text-slate-800">Processing...</h2>
              <p className="text-slate-500">Removing your email from the list.</p>
            </div>
          )}
          {unsubscribeStatus === 'success' && (
            <div className="space-y-4 animate-in fade-in zoom-in duration-500">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800">Unsubscribed Successfully</h2>
              <p className="text-slate-500">You will no longer receive emails at <strong>{unsubscribeEmail}</strong>.</p>
            </div>
          )}
          {unsubscribeStatus === 'error' && (
            <div className="space-y-4">
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800">Something went wrong</h2>
              <p className="text-slate-500">We couldn't process your request. Please try again later.</p>
            </div>
          )}
        </div>
      </div>
    );
  }
  const [activeTab, setActiveTab] = useState<'accounts' | 'contacts' | 'templates' | 'settings' | 'campaign' | 'history'>('accounts');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // --- State: History ---
  const [sentHistory, setSentHistory] = useState<SentRecord[]>(() => {
    const saved = localStorage.getItem('outreach_sent_history');
    return saved ? JSON.parse(saved) : [];
  });
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => { localStorage.setItem('outreach_sent_history', JSON.stringify(sentHistory)); }, [sentHistory]);

  // --- State: Blacklist ---
  const [blacklist, setBlacklist] = useState<string[]>(() => {
    const saved = localStorage.getItem('outreach_blacklist');
    return saved ? JSON.parse(saved) : [];
  });
  const [firebaseUnsubscribes, setFirebaseUnsubscribes] = useState<string[]>([]);
  
  useEffect(() => {
    const q = query(collection(db, 'unsubscribes'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const emails = snapshot.docs.map(doc => doc.data().email as string);
      setFirebaseUnsubscribes(emails);
    }, (error) => {
      console.error('Error fetching unsubscribes from Firebase:', error);
    });
    return () => unsubscribe();
  }, []);

  const combinedBlacklist = [...new Set([...blacklist, ...firebaseUnsubscribes])];

  const [newBlacklistEmail, setNewBlacklistEmail] = useState('');
  useEffect(() => { localStorage.setItem('outreach_blacklist', JSON.stringify(blacklist)); }, [blacklist]);

  // --- State: Accounts ---
  const [globalLimitInput, setGlobalLimitInput] = useState('');
  const [accounts, setAccounts] = useState<Account[]>(() => {
    const saved = localStorage.getItem('outreach_accounts');
    if (!saved) return [];
    try {
      const parsedAccounts: Account[] = JSON.parse(saved);
      const today = new Date().toDateString();
      const lastReset = localStorage.getItem('outreach_last_reset_date');
      
      if (lastReset !== today) {
        const resetAccounts = parsedAccounts.map(acc => ({ ...acc, sentToday: 0 }));
        localStorage.setItem('outreach_last_reset_date', today);
        return resetAccounts;
      }
      return parsedAccounts;
    } catch (e) {
      return [];
    }
  });
  const [newAccount, setNewAccount] = useState({ email: '', password: '', name: '', dailyLimit: 100 });
  const [accountToDelete, setAccountToDelete] = useState<string | null>(null);

  useEffect(() => { localStorage.setItem('outreach_accounts', JSON.stringify(accounts)); }, [accounts]);

  // --- State: Contacts ---
  const [contacts, setContacts] = useState<Contact[]>(() => {
    const saved = localStorage.getItem('outreach_contacts');
    return saved ? JSON.parse(saved) : [];
  });
  const [columns, setColumns] = useState<string[]>(() => {
    const saved = localStorage.getItem('outreach_columns');
    return saved ? JSON.parse(saved) : [];
  });
  const [fileName, setFileName] = useState<string | null>(() => {
    return localStorage.getItem('outreach_filename') || null;
  });
  const [showClearContactsConfirm, setShowClearContactsConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { localStorage.setItem('outreach_contacts', JSON.stringify(contacts)); }, [contacts]);
  useEffect(() => { localStorage.setItem('outreach_columns', JSON.stringify(columns)); }, [columns]);
  useEffect(() => { if (fileName) localStorage.setItem('outreach_filename', fileName); else localStorage.removeItem('outreach_filename'); }, [fileName]);

  // --- State: Templates (Spintax) ---
  const [subjects, setSubjects] = useState<Template[]>(() => {
    const saved = localStorage.getItem('outreach_subjects');
    return saved ? JSON.parse(saved) : [{ id: '1', text: '' }];
  });
  const [bodies, setBodies] = useState<Template[]>(() => {
    const saved = localStorage.getItem('outreach_bodies');
    return saved ? JSON.parse(saved) : [{ id: '1', text: '' }];
  });
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  useEffect(() => { localStorage.setItem('outreach_subjects', JSON.stringify(subjects)); }, [subjects]);
  useEffect(() => { localStorage.setItem('outreach_bodies', JSON.stringify(bodies)); }, [bodies]);

  // --- State: Settings ---
  const [delayType, setDelayType] = useState<'fixed' | 'random'>(() => {
    return localStorage.getItem('outreach_delay_type') as 'fixed' | 'random' || 'fixed';
  });
  const [delaySeconds, setDelaySeconds] = useState<number>(() => {
    const saved = localStorage.getItem('outreach_delay');
    return saved ? parseInt(saved, 10) : 30;
  });
  const [delayMin, setDelayMin] = useState<number>(() => {
    const saved = localStorage.getItem('outreach_delay_min');
    return saved ? parseInt(saved, 10) : 10;
  });
  const [delayMax, setDelayMax] = useState<number>(() => {
    const saved = localStorage.getItem('outreach_delay_max');
    return saved ? parseInt(saved, 10) : 15;
  });
  const [scheduledTime, setScheduledTime] = useState<string>('');
  const [includeUnsubscribe, setIncludeUnsubscribe] = useState<boolean>(() => {
    const saved = localStorage.getItem('outreach_unsub');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => { localStorage.setItem('outreach_delay_type', delayType); }, [delayType]);
  useEffect(() => { localStorage.setItem('outreach_delay', delaySeconds.toString()); }, [delaySeconds]);
  useEffect(() => { localStorage.setItem('outreach_delay_min', delayMin.toString()); }, [delayMin]);
  useEffect(() => { localStorage.setItem('outreach_delay_max', delayMax.toString()); }, [delayMax]);
  useEffect(() => { localStorage.setItem('outreach_unsub', JSON.stringify(includeUnsubscribe)); }, [includeUnsubscribe]);

  // --- State: Campaign Engine ---
  const [sendingStatus, setSendingStatus] = useState<'idle' | 'scheduled' | 'running' | 'paused' | 'completed'>('idle');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [logs, setLogs] = useState<Log[]>([]);
  const [successCount, setSuccessCount] = useState(0);
  const [failCount, setFailCount] = useState(0);

  // Refs for the loop to access latest state without stale closures
  const engineRef = useRef({
    status: 'idle',
    currentIndex: 0,
    accounts: [] as Account[],
    contacts: [] as Contact[],
    subjects: [] as Template[],
    bodies: [] as Template[],
    delayType: 'fixed' as 'fixed' | 'random',
    delaySeconds: 30,
    delayMin: 10,
    delayMax: 15,
    blacklist: [] as string[],
    includeUnsubscribe: false,
    timeoutId: null as any
  });

  // Keep refs synced
  useEffect(() => {
    engineRef.current = {
      ...engineRef.current,
      status: sendingStatus,
      currentIndex,
      accounts,
      contacts,
      subjects,
      bodies,
      delayType,
      delaySeconds,
      delayMin,
      delayMax,
      blacklist: combinedBlacklist,
      includeUnsubscribe
    };
  }, [sendingStatus, currentIndex, accounts, contacts, subjects, bodies, delayType, delaySeconds, delayMin, delayMax, combinedBlacklist, includeUnsubscribe]);


  // --- Handlers: Accounts ---
  const applyGlobalLimit = () => {
    if (!globalLimitInput) return;
    const rangeMatch = globalLimitInput.match(/^(\d+)\s*(?:-|to)\s*(\d+)$/i);
    if (rangeMatch) {
      const min = parseInt(rangeMatch[1], 10);
      const max = parseInt(rangeMatch[2], 10);
      if (min > max) return alert("Minimum limit cannot be greater than maximum limit.");
      setAccounts(accounts.map(acc => ({
        ...acc,
        dailyLimit: Math.floor(Math.random() * (max - min + 1)) + min
      })));
      alert(`Applied random daily limit between ${min} and ${max} to all accounts.`);
    } else {
      const limit = parseInt(globalLimitInput, 10);
      if (isNaN(limit) || limit < 1) return alert("Please enter a valid number or range (e.g., 10 or 10-20).");
      setAccounts(accounts.map(acc => ({
        ...acc,
        dailyLimit: limit
      })));
      alert(`Applied daily limit of ${limit} to all accounts.`);
    }
  };

  const addAccount = () => {
    if (!newAccount.email || !newAccount.password) return alert("Email and App Password are required.");
    setAccounts([...accounts, { ...newAccount, id: Date.now().toString(), sentToday: 0 }]);
    setNewAccount({ email: '', password: '', name: '', dailyLimit: 100 });
  };

  const removeAccount = (id: string) => setAccounts(accounts.filter(a => a.id !== id));

  const exportAccounts = () => {
    if (accounts.length === 0) return alert("No accounts to export.");
    const dataStr = JSON.stringify(accounts, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'my_accounts_backup.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const importAccounts = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (Array.isArray(imported)) {
          const validAccounts = imported.filter(acc => acc.email && acc.password && acc.id);
          if (validAccounts.length > 0) {
            setAccounts(validAccounts);
            alert(`Successfully imported ${validAccounts.length} accounts!`);
          } else {
            alert("No valid accounts found in the file.");
          }
        } else {
          alert("Invalid file format. Please select a valid backup JSON file.");
        }
      } catch (err) {
        alert("Failed to parse the backup file.");
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  // --- Handlers: Contacts ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data && results.data.length > 0) {
          const parsedData = results.data as Contact[];
          const dataWithStatus = parsedData.map(c => ({ ...c, _status: c._status || 'Pending' }));
          setContacts(dataWithStatus);
          
          const cols = Object.keys(results.data[0] as object);
          if (!cols.includes('_status')) cols.push('_status');
          setColumns(cols);
        }
      },
    });
  };

  const removeSentContacts = () => {
    setContacts(contacts.filter(c => c._status !== 'Sent'));
  };

  const clearAllContacts = () => {
    setFileName(null);
    setContacts([]);
    setColumns([]);
    localStorage.removeItem('outreach_contacts');
    localStorage.removeItem('outreach_columns');
    localStorage.removeItem('outreach_filename');
    setShowClearContactsConfirm(false);
  };

  const downloadUpdatedCSV = () => {
    if (contacts.length === 0) return;
    const csv = Papa.unparse(contacts);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `updated_contacts_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Handlers: Templates ---
  const insertVariable = (variable: string, target: 'subject' | 'body', id: string) => {
    const textToInsert = `{{${variable}}}`;
    if (target === 'subject') {
      setSubjects(subjects.map(s => s.id === id ? { ...s, text: s.text + textToInsert } : s));
    } else {
      setBodies(bodies.map(b => b.id === id ? { ...b, text: b.text + textToInsert } : b));
    }
  };

  const generateEmail = (template: string, contact: Contact, senderName?: string) => {
    if (!template || !contact) return '';
    let result = template;
    columns.forEach(col => {
      const regex = new RegExp(`{{${col}}}`, 'g');
      result = result.replace(regex, contact[col] || '');
    });
    
    // Replace SenderName variable if present
    if (senderName) {
      result = result.replace(/{{SenderName}}/g, senderName);
    }
    
    return result;
  };

  // --- Engine Logic ---
  const getAvailableAccount = (accs: Account[]) => {
    const available = accs.filter(a => a.sentToday < a.dailyLimit);
    if (available.length === 0) return null;
    // Sort by sentToday to distribute evenly
    return available.sort((a, b) => a.sentToday - b.sentToday)[0];
  };

  const addLog = (log: Omit<Log, 'id' | 'time'>) => {
    setLogs(prev => [{ ...log, id: Date.now().toString(), time: new Date() }, ...prev]);
  };

  const processQueue = async () => {
    const state = engineRef.current;
    if (state.status !== 'running') return;

    if (state.currentIndex >= state.contacts.length) {
      setSendingStatus('completed');
      return;
    }

    const contact = state.contacts[state.currentIndex];
    
    // Skip if already sent
    if (contact._status === 'Sent') {
      const nextIndex = state.currentIndex + 1;
      setCurrentIndex(nextIndex);
      if (nextIndex < state.contacts.length && engineRef.current.status === 'running') {
        engineRef.current.timeoutId = setTimeout(processQueue, 100); // Fast skip
      } else if (nextIndex >= state.contacts.length) {
        setSendingStatus('completed');
      }
      return;
    }

    const account = getAvailableAccount(state.accounts);

    if (!account) {
      alert("All connected accounts have reached their daily sending limits!");
      setSendingStatus('paused');
      return;
    }

    // Random template selection to ensure even distribution across all accounts
    // and prevent mathematical correlation bugs when array lengths match
    const subjectTpl = state.subjects[Math.floor(Math.random() * state.subjects.length)]?.text || '';
    const bodyTpl = state.bodies[Math.floor(Math.random() * state.bodies.length)]?.text || '';

    const subject = generateEmail(subjectTpl, contact, account.name);
    const html = generateEmail(bodyTpl, contact, account.name);
    
    // Find email column
    const emailKey = Object.keys(contact).find(k => k.toLowerCase().includes('email'));
    const toEmail = emailKey ? contact[emailKey] : null;

    if (toEmail && state.blacklist.includes(toEmail.toLowerCase().trim())) {
      setFailCount(f => f + 1);
      addLog({ to: toEmail, status: 'error', message: 'Skipped (Blacklisted)' });
      
      // Move to next
      const nextIndex = state.currentIndex + 1;
      setCurrentIndex(nextIndex);
      if (nextIndex < state.contacts.length && engineRef.current.status === 'running') {
        engineRef.current.timeoutId = setTimeout(processQueue, 100); // Fast skip
      } else if (nextIndex >= state.contacts.length) {
        setSendingStatus('completed');
      }
      return;
    }

    if (toEmail && subject && html) {
      try {
        let finalHtml = html;
        if (state.includeUnsubscribe) {
          let baseUrl = window.location.origin;
          // In AI Studio, the dev URL is protected. We must use the shared (pre) URL for public links.
          if (baseUrl.includes('ais-dev-')) {
            baseUrl = baseUrl.replace('ais-dev-', 'ais-pre-');
          }
          const unsubLink = `${baseUrl}/?unsubscribe=${encodeURIComponent(toEmail)}`;
          finalHtml += `<br><br><p style="font-size:12px; color:#888;">If you no longer wish to receive these emails, <a href="${unsubLink}">click here to unsubscribe</a>.</p>`;
        }

        const res = await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credentials: account, to: toEmail, subject, html: finalHtml })
        });
        
        let data;
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          data = await res.json();
        } else {
          const text = await res.text();
          throw new Error(`Server Error (${res.status}): The server returned an invalid response. Please try refreshing the page.`);
        }
        
        if (!res.ok) throw new Error(data?.error || 'Failed');
        
        // Update account sent count
        setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, sentToday: a.sentToday + 1 } : a));
        
        // Update contact status to Sent
        setContacts(prev => {
          const newContacts = [...prev];
          newContacts[state.currentIndex] = { ...newContacts[state.currentIndex], _status: 'Sent' };
          return newContacts;
        });

        setSuccessCount(s => s + 1);
        addLog({ to: toEmail, status: 'success', message: 'Sent successfully', account: account.email });
        
        // Add to persistent history
        const newRecord: SentRecord = {
          id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
          email: toEmail,
          sentAt: new Date().toISOString(),
          account: account.email,
          subject: subject
        };
        setSentHistory(prev => [newRecord, ...prev]);
      } catch (err: any) {
        const errorMessage = err.message || 'Failed';
        
        // Handle AI Studio proxy rate limit / redirect issue
        if (errorMessage.includes('wrong method: GET')) {
          const retryCount = (contact as any)._retryCount || 0;
          if (retryCount < 3) {
            addLog({ to: toEmail, status: 'error', message: `Network proxy issue, retrying (${retryCount + 1}/3)...`, account: account.email });
            
            setContacts(prev => {
              const newContacts = [...prev];
              newContacts[state.currentIndex] = { ...newContacts[state.currentIndex], _retryCount: retryCount + 1 };
              return newContacts;
            });

            // Retry after 5 seconds without advancing the index
            if (engineRef.current.status === 'running') {
              engineRef.current.timeoutId = setTimeout(processQueue, 5000);
            }
            return; // Exit here so we don't move to the next contact
          }
        }

        setFailCount(f => f + 1);
        addLog({ to: toEmail, status: 'error', message: errorMessage, account: account.email });
        
        // Update contact status to Failed
        setContacts(prev => {
          const newContacts = [...prev];
          newContacts[state.currentIndex] = { ...newContacts[state.currentIndex], _status: `Failed: ${errorMessage}` };
          return newContacts;
        });
      }
    } else {
      setFailCount(f => f + 1);
      const errorMessage = 'Missing email, subject, or body';
      addLog({ to: toEmail || 'Unknown', status: 'error', message: errorMessage });
      
      // Update contact status to Failed
      setContacts(prev => {
        const newContacts = [...prev];
        newContacts[state.currentIndex] = { ...newContacts[state.currentIndex], _status: `Failed: ${errorMessage}` };
        return newContacts;
      });
    }

    // Move to next
    const nextIndex = state.currentIndex + 1;
    setCurrentIndex(nextIndex);

    if (nextIndex < state.contacts.length && engineRef.current.status === 'running') {
      const currentDelay = state.delayType === 'random' 
        ? Math.floor(Math.random() * (state.delayMax - state.delayMin + 1)) + state.delayMin
        : state.delaySeconds;
      engineRef.current.timeoutId = setTimeout(processQueue, currentDelay * 1000);
    } else if (nextIndex >= state.contacts.length) {
      setSendingStatus('completed');
    }
  };

  const startCampaign = () => {
    if (accounts.length === 0) return alert("Please add at least one Gmail account.");
    if (contacts.length === 0) return alert("Please upload contacts.");
    if (!subjects[0].text || !bodies[0].text) return alert("Please add at least one subject and body template.");

    // Check if we need to reset daily limits before starting
    const today = new Date().toDateString();
    const lastReset = localStorage.getItem('outreach_last_reset_date');
    if (lastReset !== today) {
      const resetAccounts = accounts.map(acc => ({ ...acc, sentToday: 0 }));
      setAccounts(resetAccounts);
      engineRef.current.accounts = resetAccounts;
      localStorage.setItem('outreach_last_reset_date', today);
    }

    if (scheduledTime) {
      const now = new Date().getTime();
      const sched = new Date(scheduledTime).getTime();
      if (sched > now) {
        setSendingStatus('scheduled');
        engineRef.current.timeoutId = setTimeout(() => {
          setSendingStatus('running');
          processQueue();
        }, sched - now);
        return;
      }
    }

    setSendingStatus('running');
    // Use setTimeout to allow state to sync before starting loop
    setTimeout(processQueue, 100);
  };

  const pauseCampaign = () => {
    setSendingStatus('paused');
    if (engineRef.current.timeoutId) clearTimeout(engineRef.current.timeoutId);
  };

  const stopCampaign = () => {
    setSendingStatus('idle');
    setCurrentIndex(0);
    setLogs([]);
    setSuccessCount(0);
    setFailCount(0);
    if (engineRef.current.timeoutId) clearTimeout(engineRef.current.timeoutId);
  };

  // --- Handlers: History ---
  const downloadHistoryCSV = () => {
    if (sentHistory.length === 0) return;
    const headers = ['Email', 'Sent At', 'Sender Account', 'Subject'];
    const csvContent = [
      headers.join(','),
      ...sentHistory.map(r => `"${r.email}","${new Date(r.sentAt).toLocaleString()}","${r.account}","${r.subject.replace(/"/g, '""')}"`)
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `sent_history_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const clearHistory = () => {
    setSentHistory([]);
    setShowClearConfirm(false);
  };

  // --- Handlers: Blacklist ---
  const addToBlacklist = () => {
    if (!newBlacklistEmail) return;
    const email = newBlacklistEmail.toLowerCase().trim();
    if (!blacklist.includes(email)) {
      setBlacklist([email, ...blacklist]);
    }
    setNewBlacklistEmail('');
  };

  const removeFromBlacklist = (email: string) => {
    setBlacklist(blacklist.filter(e => e !== email));
  };

  const downloadBlacklistCSV = () => {
    if (combinedBlacklist.length === 0) return;
    const csvContent = "Email\n" + combinedBlacklist.map(e => `"${e}"`).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `blacklist_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- UI Helpers ---
  const navItems = [
    { id: 'accounts', label: 'Sender Accounts', icon: Users },
    { id: 'contacts', label: 'Leads & Contacts', icon: Upload },
    { id: 'templates', label: 'Email Sequences', icon: LayoutTemplate },
    { id: 'settings', label: 'Campaign Settings', icon: Settings },
    { id: 'blacklist', label: 'Blacklist', icon: ShieldAlert },
    { id: 'campaign', label: 'Live Dashboard', icon: Activity },
    { id: 'history', label: 'Sent History', icon: History },
  ] as const;

  const getPageTitle = () => navItems.find(n => n.id === activeTab)?.label || 'Dashboard';

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      
      {/* Sidebar Navigation */}
      <aside className={`${isSidebarCollapsed ? 'w-20' : 'w-64'} bg-slate-900 text-slate-300 flex flex-col shadow-xl z-20 transition-all duration-300 shrink-0`}>
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800 bg-slate-950">
          <div className={`flex items-center gap-2 text-white ${isSidebarCollapsed ? 'hidden' : 'flex'}`}>
            <div className="bg-indigo-500 p-1.5 rounded-lg shrink-0">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight truncate">OutreachPro</span>
          </div>
          <button 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} 
            className={`p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors ${isSidebarCollapsed ? 'mx-auto' : ''}`}
            title="Toggle Sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 py-6 px-3 space-y-1 overflow-y-auto overflow-x-hidden">
          {!isSidebarCollapsed && <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Campaign Setup</p>}
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                title={isSidebarCollapsed ? item.label : undefined}
                className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-3'} py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive 
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/20' 
                    : 'hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-indigo-200' : 'text-slate-400'}`} />
                {!isSidebarCollapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-950/50">
          <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
            <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
              OP
            </div>
            {!isSidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">Workspace</p>
                <p className="text-xs text-slate-500 truncate">Pro Plan</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
        
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0 z-10">
          <h1 className="text-xl font-semibold text-slate-800 tracking-tight">{getPageTitle()}</h1>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              <span className="text-slate-600 font-medium">{accounts.length} Accounts Active</span>
            </div>
            <div className="h-4 w-px bg-slate-200"></div>
            <div className="flex items-center gap-2 text-sm text-slate-600 font-medium">
              <Activity className="w-4 h-4 text-slate-400" />
              {accounts.reduce((sum, acc) => sum + acc.dailyLimit, 0)} Total Daily Limit
            </div>
            <div className="h-4 w-px bg-slate-200"></div>
            <div className="flex items-center gap-2 text-sm text-slate-600 font-medium">
              <Inbox className="w-4 h-4 text-slate-400" />
              {contacts.length} Leads
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-5xl mx-auto">
            
            {/* TAB: ACCOUNTS */}
            {activeTab === 'accounts' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 flex items-center justify-between shadow-sm">
                  <div>
                    <h3 className="text-sm font-semibold text-indigo-900">Total Sending Capacity</h3>
                    <p className="text-xs text-indigo-700 mt-1">Sum of daily limits across all {accounts.length} accounts. Upload this many emails in your CSV.</p>
                  </div>
                  <div className="text-3xl font-bold text-indigo-600 flex items-baseline gap-1">
                    {accounts.reduce((sum, acc) => sum + acc.dailyLimit, 0)} <span className="text-sm font-medium text-indigo-500">emails/day</span>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
                  <div className="px-6 py-5 border-b border-slate-200 bg-slate-50/50">
                    <h3 className="text-base font-semibold text-slate-900">Global Daily Limit</h3>
                    <p className="text-sm text-slate-500 mt-1">Set a daily limit for all accounts. Enter a number (e.g., 10) or a range (e.g., 10-20) to assign randomly.</p>
                  </div>
                  <div className="p-6 flex gap-3 items-center">
                    <input 
                      type="text" 
                      value={globalLimitInput} 
                      onChange={e => setGlobalLimitInput(e.target.value)} 
                      placeholder="e.g., 10 or 10-20" 
                      className="w-48 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                    />
                    <button 
                      onClick={applyGlobalLimit} 
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors shadow-sm"
                    >
                      Apply to All
                    </button>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 bg-slate-50/50">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">Connected Sender Accounts</h2>
                      <p className="text-sm text-slate-500 mt-1">Manage your Gmail accounts used for sending campaigns.</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={exportAccounts} className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm">
                        <Download className="w-4 h-4" /> Export Backup
                      </button>
                      <label className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm cursor-pointer">
                        <Upload className="w-4 h-4" /> Import Backup
                        <input type="file" accept=".json" onChange={importAccounts} className="hidden" />
                      </label>
                    </div>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                        <tr>
                          <th className="px-6 py-4">Email Address</th>
                          <th className="px-6 py-4">Sender Name</th>
                          <th className="px-6 py-4">Daily Limit</th>
                          <th className="px-6 py-4">Sent Today</th>
                          <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {accounts.length === 0 && (
                          <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-500">No accounts connected yet. Add one below.</td></tr>
                        )}
                        {accounts.map(acc => (
                          <tr key={acc.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4 font-medium text-slate-900 flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">
                                {acc.email.charAt(0).toUpperCase()}
                              </div>
                              {acc.email}
                            </td>
                            <td className="px-6 py-4 text-slate-600">{acc.name || '-'}</td>
                            <td className="px-6 py-4 text-slate-600">
                              <input 
                                type="number" 
                                min="1"
                                value={acc.dailyLimit} 
                                onChange={(e) => {
                                  const newLimit = parseInt(e.target.value) || 0;
                                  setAccounts(accounts.map(a => a.id === acc.id ? { ...a, dailyLimit: newLimit } : a));
                                }}
                                className="w-20 px-2 py-1 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm bg-white"
                                title="Edit Daily Limit"
                              />
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden w-24">
                                  <div 
                                    className={`h-full rounded-full ${acc.sentToday >= acc.dailyLimit ? 'bg-red-500' : 'bg-green-500'}`}
                                    style={{ width: `${Math.min((acc.sentToday / acc.dailyLimit) * 100, 100)}%` }}
                                  />
                                </div>
                                <span className="text-xs font-medium text-slate-600">{acc.sentToday}/{acc.dailyLimit}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                              {accountToDelete === acc.id ? (
                                <div className="flex items-center justify-end gap-2">
                                  <span className="text-xs text-red-600 font-medium">Sure?</span>
                                  <button onClick={() => { removeAccount(acc.id); setAccountToDelete(null); }} className="text-xs font-bold text-white bg-red-600 hover:bg-red-700 px-2 py-1 rounded transition-colors">Yes</button>
                                  <button onClick={() => setAccountToDelete(null)} className="text-xs font-medium text-slate-700 bg-slate-200 hover:bg-slate-300 px-2 py-1 rounded transition-colors">No</button>
                                </div>
                              ) : (
                                <button onClick={() => setAccountToDelete(acc.id)} className="text-slate-400 hover:text-red-600 transition-colors p-2 rounded-md hover:bg-red-50" title="Remove Account">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="px-6 py-5 border-b border-slate-200 bg-slate-50/50">
                    <h3 className="text-base font-semibold text-slate-900">Add New Account</h3>
                    <p className="text-sm text-slate-500 mt-1">Connect a new Gmail account using an App Password.</p>
                  </div>
                  <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                      <div className="lg:col-span-1">
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Gmail Address</label>
                        <input type="email" value={newAccount.email} onChange={e => setNewAccount({...newAccount, email: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm transition-shadow" placeholder="you@gmail.com" />
                      </div>
                      <div className="lg:col-span-1">
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">App Password</label>
                        <input type="password" value={newAccount.password} onChange={e => setNewAccount({...newAccount, password: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm transition-shadow" placeholder="16-char password" />
                      </div>
                      <div className="lg:col-span-1">
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Sender Name</label>
                        <input type="text" value={newAccount.name} onChange={e => setNewAccount({...newAccount, name: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm transition-shadow" placeholder="John Doe" />
                      </div>
                      <div className="lg:col-span-1">
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Daily Limit</label>
                        <input type="number" value={newAccount.dailyLimit} onChange={e => setNewAccount({...newAccount, dailyLimit: parseInt(e.target.value) || 0})} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm transition-shadow" />
                      </div>
                      <div className="lg:col-span-1">
                        <button onClick={addAccount} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors shadow-sm">
                          <Plus className="w-4 h-4" /> Add Account
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-slate-500 mt-4 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-indigo-500" />
                      Use a <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="text-indigo-600 hover:text-indigo-700 font-medium hover:underline">Google App Password</a>. Credentials are stored locally in your browser.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: CONTACTS */}
            {activeTab === 'contacts' && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="px-6 py-5 border-b border-slate-200 bg-slate-50/50">
                  <h2 className="text-base font-semibold text-slate-900">Upload Leads</h2>
                  <p className="text-sm text-slate-500 mt-1">Import your contacts via CSV file. Ensure you have an 'Email' column.</p>
                </div>
                
                <div className="p-6">
                  {!fileName ? (
                    <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-slate-300 rounded-xl p-16 text-center cursor-pointer hover:bg-slate-50 hover:border-indigo-400 transition-all group">
                      <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                        <Upload className="w-8 h-8 text-indigo-600" />
                      </div>
                      <p className="text-lg text-slate-700 font-medium">Click or drag CSV file to upload</p>
                      <p className="text-sm text-slate-500 mt-2">Maximum file size 50MB. Must contain an 'Email' column.</p>
                      <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                    </div>
                  ) : (
                    <div>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-indigo-50/50 border border-indigo-100 p-4 rounded-xl mb-6 gap-4">
                        <div className="flex items-center gap-4">
                          <div className="p-3 bg-white rounded-lg shadow-sm border border-indigo-100">
                            <FileText className="w-6 h-6 text-indigo-600" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{fileName}</p>
                            <p className="text-sm text-slate-500">{contacts.length} valid contacts loaded</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button onClick={downloadUpdatedCSV} className="text-sm font-medium text-indigo-600 hover:text-indigo-700 bg-white border border-indigo-200 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
                            <Download className="w-4 h-4" /> Download CSV
                          </button>
                          <button onClick={removeSentContacts} className="text-sm font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
                            <Trash2 className="w-4 h-4" /> Remove Sent
                          </button>
                          {showClearContactsConfirm ? (
                            <div className="flex items-center gap-2 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100">
                              <span className="text-sm text-red-600 font-medium">Are you sure?</span>
                              <button onClick={clearAllContacts} className="text-sm font-bold text-red-700 hover:text-red-800">Yes</button>
                              <button onClick={() => setShowClearContactsConfirm(false)} className="text-sm font-medium text-slate-500 hover:text-slate-700">No</button>
                            </div>
                          ) : (
                            <button onClick={() => setShowClearContactsConfirm(true)} className="text-sm font-medium text-red-600 hover:text-red-700 bg-white border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
                              <X className="w-4 h-4" /> Clear Memory
                            </button>
                          )}
                        </div>
                      </div>
                      
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <div className="overflow-x-auto max-h-[500px]">
                          <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200 sticky top-0 z-10">
                              <tr>
                                {columns.map(col => <th key={col} className="px-6 py-3 whitespace-nowrap">{col}</th>)}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {contacts.slice(0, 100).map((contact, i) => (
                                <tr key={i} className="hover:bg-slate-50 transition-colors">
                                  {columns.map(col => (
                                    <td key={col} className="px-6 py-3 truncate max-w-[200px] text-slate-600">
                                      {col === '_status' ? (
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                          contact[col] === 'Sent' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-800'
                                        }`}>
                                          {contact[col]}
                                        </span>
                                      ) : (
                                        contact[col]
                                      )}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                      {contacts.length > 100 && <p className="text-sm text-center text-slate-500 mt-4">Showing first 100 of {contacts.length} rows</p>}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB: TEMPLATES */}
            {activeTab === 'templates' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                
                <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">Available Variables:</span>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => navigator.clipboard.writeText(`{{SenderName}}`)} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 text-xs font-medium rounded-md border transition-all cursor-copy" title="Click to copy">
                        {`{{SenderName}}`}
                      </button>
                      {columns.length > 0 ? columns.map(col => (
                        <button key={col} onClick={() => navigator.clipboard.writeText(`{{${col}}}`)} className="px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 text-slate-700 text-xs font-medium rounded-md border border-slate-200 transition-all cursor-copy" title="Click to copy">
                          {`{{${col}}}`}
                        </button>
                      )) : (
                        <span className="text-xs text-slate-500 italic">Upload contacts to see more variables (e.g., {"{{Name}}"})</span>
                      )}
                    </div>
                  </div>
                  <button 
                    onClick={() => setPreviewIndex(previewIndex === null ? 0 : null)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${previewIndex !== null ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                  >
                    <Eye className="w-4 h-4" /> {previewIndex !== null ? 'Exit Preview' : 'Preview Mode'}
                  </button>
                </div>

                {previewIndex !== null ? (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="px-6 py-5 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
                      <div>
                        <h2 className="text-base font-semibold text-slate-900">Live Preview</h2>
                        <p className="text-sm text-slate-500 mt-0.5">Showing how the email will look for your contacts.</p>
                      </div>
                      {contacts.length > 0 && (
                        <div className="flex items-center gap-3">
                          <button onClick={() => setPreviewIndex(Math.max(0, previewIndex - 1))} disabled={previewIndex === 0} className="p-1.5 rounded bg-slate-200 text-slate-600 disabled:opacity-50">&larr;</button>
                          <span className="text-sm font-medium text-slate-600">Contact {previewIndex + 1} of {contacts.length}</span>
                          <button onClick={() => setPreviewIndex(Math.min(contacts.length - 1, previewIndex + 1))} disabled={previewIndex === contacts.length - 1} className="p-1.5 rounded bg-slate-200 text-slate-600 disabled:opacity-50">&rarr;</button>
                        </div>
                      )}
                    </div>
                    <div className="p-6">
                      {contacts.length === 0 ? (
                        <div className="text-center py-8 text-slate-500">Please upload contacts to see a preview.</div>
                      ) : (
                        <div className="space-y-6">
                          <div>
                            <label className="text-xs font-bold text-slate-400 uppercase">Subject (Variant 1)</label>
                            <div className="mt-1 p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium">
                              {generateEmail(subjects[0]?.text || '', contacts[previewIndex], accounts[0]?.name || 'Sender Name')}
                            </div>
                          </div>
                          <div>
                            <label className="text-xs font-bold text-slate-400 uppercase">Body (Variant 1)</label>
                            <div 
                              className="mt-1 p-5 bg-white border border-slate-200 rounded-lg text-slate-800 prose prose-sm max-w-none"
                              dangerouslySetInnerHTML={{ __html: generateEmail(bodies[0]?.text || '', contacts[previewIndex], accounts[0]?.name || 'Sender Name') }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col space-y-8">
                    {/* Subjects */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                      <div className="px-6 py-5 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
                        <div>
                          <h2 className="text-base font-semibold text-slate-900">Subject Lines (Spintax)</h2>
                          <p className="text-sm text-slate-500 mt-0.5">Add multiple subject lines. The system will rotate them automatically to improve deliverability.</p>
                        </div>
                        <button onClick={() => setSubjects([...subjects, { id: Date.now().toString(), text: '' }])} className="bg-white border border-slate-200 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm">
                          <Plus className="w-4 h-4"/> Add Subject
                        </button>
                      </div>
                      <div className="p-6 space-y-4 bg-slate-50/30">
                        {subjects.map((sub, index) => (
                          <div key={sub.id} className="flex gap-3 items-start group">
                            <div className="flex flex-col items-center gap-1 mt-1">
                              <span className="bg-slate-100 text-slate-500 w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold border border-slate-200">{index + 1}</span>
                            </div>
                            <div className="flex-1 relative">
                              <input type="text" value={sub.text} onChange={e => setSubjects(subjects.map(s => s.id === sub.id ? {...s, text: e.target.value} : s))} className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm shadow-sm transition-shadow" placeholder="Enter subject line (e.g., Quick question for {{Name}})..." />
                            </div>
                            {subjects.length > 1 && (
                              <button onClick={() => setSubjects(subjects.filter(s => s.id !== sub.id))} className="text-slate-400 hover:text-red-600 p-3 opacity-0 group-hover:opacity-100 transition-opacity" title="Remove Subject"><Trash2 className="w-5 h-5"/></button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Bodies */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                      <div className="px-6 py-5 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
                        <div>
                          <h2 className="text-base font-semibold text-slate-900">Email Bodies (Spintax)</h2>
                          <p className="text-sm text-slate-500 mt-0.5">Design your email content. Add multiple variants to A/B test and avoid spam filters.</p>
                        </div>
                        <button onClick={() => setBodies([...bodies, { id: Date.now().toString(), text: '' }])} className="bg-white border border-slate-200 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm">
                          <Plus className="w-4 h-4"/> Add Variant
                        </button>
                      </div>
                      <div className="p-6 space-y-8 bg-slate-50/30">
                        {bodies.map((body, index) => (
                          <div key={body.id} className="relative group bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden transition-all hover:shadow-md">
                            <div className="flex justify-between items-center px-5 py-3 border-b border-slate-100 bg-slate-50">
                              <div className="flex items-center gap-3">
                                <span className="bg-indigo-100 text-indigo-700 w-6 h-6 flex items-center justify-center rounded-md text-xs font-bold">{index + 1}</span>
                                <span className="text-sm font-semibold text-slate-700">Email Variant</span>
                              </div>
                              {bodies.length > 1 && (
                                <button onClick={() => setBodies(bodies.filter(b => b.id !== body.id))} className="text-slate-400 hover:text-red-600 text-sm flex items-center gap-1.5 font-medium transition-colors px-2 py-1 rounded hover:bg-red-50"><Trash2 className="w-4 h-4"/> Delete</button>
                              )}
                            </div>
                            <div className="editor-container p-0">
                              <ReactQuill 
                                theme="snow"
                                value={body.text} 
                                onChange={value => setBodies(bodies.map(b => b.id === body.id ? {...b, text: value} : b))} 
                                modules={quillModules}
                                className="h-[250px] mb-12"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB: SETTINGS */}
            {activeTab === 'settings' && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-200 bg-slate-50/50">
                  <h2 className="text-base font-semibold text-slate-900">Campaign Settings</h2>
                  <p className="text-sm text-slate-500 mt-1">Configure sending behavior and schedules.</p>
                </div>
                
                <div className="p-6 space-y-8">
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">Delay Between Emails</label>
                    <p className="text-sm text-slate-500 mb-4">Adding a delay mimics human behavior and protects your accounts from being flagged as spam.</p>
                    
                    <div className="flex items-center gap-6 mb-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="delayType" checked={delayType === 'fixed'} onChange={() => setDelayType('fixed')} className="text-indigo-600 focus:ring-indigo-500" />
                        <span className="text-sm font-medium text-slate-700">Fixed Delay</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="delayType" checked={delayType === 'random'} onChange={() => setDelayType('random')} className="text-indigo-600 focus:ring-indigo-500" />
                        <span className="text-sm font-medium text-slate-700">Random Range</span>
                      </label>
                    </div>

                    {delayType === 'fixed' ? (
                      <div className="flex items-center gap-3">
                        <input type="number" min="1" value={delaySeconds} onChange={e => setDelaySeconds(parseInt(e.target.value) || 1)} className="w-32 px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm shadow-sm" />
                        <span className="text-sm font-medium text-slate-600">seconds</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <input type="number" min="1" value={delayMin} onChange={e => setDelayMin(parseInt(e.target.value) || 1)} className="w-24 px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm shadow-sm" placeholder="Min" />
                        <span className="text-sm font-medium text-slate-600">to</span>
                        <input type="number" min="1" value={delayMax} onChange={e => setDelayMax(parseInt(e.target.value) || 1)} className="w-24 px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm shadow-sm" placeholder="Max" />
                        <span className="text-sm font-medium text-slate-600">seconds</span>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-200 pt-8">
                    <label className="block text-sm font-semibold text-slate-900 mb-2">Schedule Start Time (Optional)</label>
                    <p className="text-sm text-slate-500 mb-4">Leave blank to start immediately. Keep this browser tab open for the schedule to work.</p>
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Clock className="h-5 w-5 text-slate-400" />
                        </div>
                        <input type="datetime-local" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} className="pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm shadow-sm" />
                      </div>
                      {scheduledTime && <button onClick={() => setScheduledTime('')} className="text-sm font-medium text-slate-500 hover:text-red-600 transition-colors px-3 py-2">Clear Schedule</button>}
                    </div>
                  </div>

                  <div className="border-t border-slate-200 pt-8">
                    <label className="block text-sm font-semibold text-slate-900 mb-2">Unsubscribe Link</label>
                    <p className="text-sm text-slate-500 mb-4">Automatically add an unsubscribe link to the bottom of your emails to comply with spam laws.</p>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={includeUnsubscribe} onChange={e => setIncludeUnsubscribe(e.target.checked)} className="w-5 h-5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500" />
                      <span className="text-sm font-medium text-slate-700">Include "Unsubscribe" link in emails</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: CAMPAIGN */}
            {activeTab === 'campaign' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                
                {/* Header & Controls */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Campaign Overview</h2>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="relative flex h-2.5 w-2.5">
                        {sendingStatus === 'running' && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>}
                        <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                          sendingStatus === 'running' ? 'bg-indigo-500' :
                          sendingStatus === 'paused' ? 'bg-amber-500' :
                          sendingStatus === 'completed' ? 'bg-emerald-500' :
                          sendingStatus === 'scheduled' ? 'bg-blue-500' :
                          'bg-slate-300'
                        }`}></span>
                      </span>
                      <span className="text-sm font-medium text-slate-600 capitalize">
                        {sendingStatus === 'idle' ? 'Ready to Launch' : sendingStatus}
                      </span>
                      {sendingStatus === 'scheduled' && (
                        <span className="text-xs text-slate-500 ml-2 border-l border-slate-300 pl-2">
                          Starts: {new Date(scheduledTime).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {sendingStatus === 'idle' && (
                      <button onClick={startCampaign} className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 px-6 rounded-lg flex items-center gap-2 transition-all shadow-sm">
                        <Play className="w-4 h-4 fill-current" /> Launch Campaign
                      </button>
                    )}
                    {sendingStatus === 'scheduled' && (
                      <button onClick={stopCampaign} className="bg-white border border-slate-300 hover:bg-red-50 text-red-600 font-medium py-2.5 px-6 rounded-lg transition-all shadow-sm">
                        Cancel Schedule
                      </button>
                    )}
                    {sendingStatus === 'running' && (
                      <>
                        <button onClick={pauseCampaign} className="bg-amber-500 hover:bg-amber-600 text-white font-medium py-2.5 px-6 rounded-lg flex items-center gap-2 transition-all shadow-sm">
                          <Pause className="w-4 h-4 fill-current" /> Pause Campaign
                        </button>
                        <button onClick={stopCampaign} className="bg-white border border-red-200 hover:bg-red-50 text-red-600 font-medium py-2.5 px-6 rounded-lg flex items-center gap-2 transition-all shadow-sm">
                          <Square className="w-4 h-4 fill-current" /> Stop & Reset
                        </button>
                      </>
                    )}
                    {sendingStatus === 'paused' && (
                      <>
                        <button onClick={startCampaign} className="bg-emerald-500 hover:bg-emerald-600 text-white font-medium py-2.5 px-6 rounded-lg flex items-center gap-2 transition-all shadow-sm">
                          <Play className="w-4 h-4 fill-current" /> Resume Campaign
                        </button>
                        <button onClick={stopCampaign} className="bg-white border border-red-200 hover:bg-red-50 text-red-600 font-medium py-2.5 px-6 rounded-lg flex items-center gap-2 transition-all shadow-sm">
                          <Square className="w-4 h-4 fill-current" /> Stop & Reset
                        </button>
                      </>
                    )}
                    {sendingStatus === 'completed' && (
                      <button onClick={stopCampaign} className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium py-2.5 px-6 rounded-lg transition-all shadow-sm">
                        Start New Campaign
                      </button>
                    )}
                  </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                    <p className="text-sm font-medium text-slate-500 mb-1">Total Leads</p>
                    <p className="text-3xl font-bold text-slate-900">{contacts.length}</p>
                  </div>
                  <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                    <p className="text-sm font-medium text-slate-500 mb-1">Successfully Sent</p>
                    <p className="text-3xl font-bold text-emerald-600">{successCount}</p>
                  </div>
                  <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                    <p className="text-sm font-medium text-slate-500 mb-1">Failed / Skipped</p>
                    <p className="text-3xl font-bold text-red-500">{failCount}</p>
                  </div>
                  <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                    <p className="text-sm font-medium text-slate-500 mb-1">Pending</p>
                    <p className="text-3xl font-bold text-indigo-600">{Math.max(0, contacts.length - currentIndex)}</p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                  <div className="flex justify-between items-end mb-3">
                    <h3 className="text-sm font-semibold text-slate-900">Sending Progress</h3>
                    <p className="text-sm font-bold text-indigo-600">
                      {contacts.length > 0 ? Math.round((currentIndex / contacts.length) * 100) : 0}%
                    </p>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div 
                      className="bg-indigo-500 h-full rounded-full transition-all duration-500 ease-out" 
                      style={{ width: `${contacts.length > 0 ? (currentIndex / contacts.length) * 100 : 0}%` }}
                    ></div>
                  </div>
                </div>

                {/* Activity Feed (Replaces Terminal) */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="px-6 py-5 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
                    <h3 className="text-base font-semibold text-slate-900">Recent Activity</h3>
                    <span className="text-xs font-medium text-slate-500 bg-white px-2.5 py-1 rounded-md border border-slate-200">Live Feed</span>
                  </div>
                  <div className="overflow-x-auto max-h-[400px]">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-white text-slate-500 font-medium border-b border-slate-100 sticky top-0 z-10">
                        <tr>
                          <th className="px-6 py-3">Time</th>
                          <th className="px-6 py-3">Recipient</th>
                          <th className="px-6 py-3">Status</th>
                          <th className="px-6 py-3">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {logs.length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                              <Activity className="w-8 h-8 mx-auto mb-3 text-slate-300" />
                              <p>No activity yet. Launch the campaign to see live updates.</p>
                            </td>
                          </tr>
                        )}
                        {logs.map(log => (
                          <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-3.5 text-slate-500 whitespace-nowrap">{log.time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}</td>
                            <td className="px-6 py-3.5 font-medium text-slate-900">{log.to}</td>
                            <td className="px-6 py-3.5">
                              {log.status === 'success' ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-100">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Sent
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-red-700 text-xs font-medium border border-red-100">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> Failed/Skipped
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-3.5 text-slate-600">
                              {log.message} {log.account && <span className="text-slate-400 text-xs ml-1">(via {log.account})</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}

            {/* TAB: BLACKLIST */}
            {activeTab === 'blacklist' && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="px-6 py-5 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">Do Not Email (Blacklist)</h2>
                    <p className="text-sm text-slate-500 mt-1">Contacts in this list will be automatically skipped during campaigns.</p>
                  </div>
                  <button onClick={downloadBlacklistCSV} disabled={combinedBlacklist.length === 0} className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium py-2.5 px-4 rounded-lg text-sm flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
                    <Download className="w-4 h-4" /> Export CSV
                  </button>
                </div>
                
                <div className="p-6 border-b border-slate-200 bg-slate-50/30">
                  <div className="flex gap-3 max-w-md">
                    <input 
                      type="email" 
                      value={newBlacklistEmail} 
                      onChange={e => setNewBlacklistEmail(e.target.value)} 
                      placeholder="Enter email to block..." 
                      className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm shadow-sm"
                      onKeyDown={e => e.key === 'Enter' && addToBlacklist()}
                    />
                    <button onClick={addToBlacklist} className="bg-slate-800 hover:bg-slate-900 text-white font-medium py-2.5 px-4 rounded-lg text-sm flex items-center gap-2 transition-colors shadow-sm">
                      <Plus className="w-4 h-4" /> Add
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-[400px]">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200 sticky top-0">
                      <tr>
                        <th className="px-6 py-4">Blacklisted Email</th>
                        <th className="px-6 py-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {combinedBlacklist.length === 0 && (
                        <tr><td colSpan={2} className="px-6 py-12 text-center text-slate-500">No emails in blacklist.</td></tr>
                      )}
                      {combinedBlacklist.map(email => (
                        <tr key={email} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 font-medium text-slate-900">
                            {email}
                            {firebaseUnsubscribes.includes(email) && (
                              <span className="ml-3 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                                Unsubscribed
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {!firebaseUnsubscribes.includes(email) && (
                              <button onClick={() => removeFromBlacklist(email)} className="text-slate-400 hover:text-red-600 p-2 rounded-md hover:bg-red-50 transition-colors" title="Remove from blacklist">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB: HISTORY */}
            {activeTab === 'history' && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="px-6 py-5 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">Sent Emails History</h2>
                    <p className="text-sm text-slate-500 mt-1">Record of all successfully sent emails. This data is saved locally.</p>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={downloadHistoryCSV} disabled={sentHistory.length === 0} className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium py-2.5 px-4 rounded-lg text-sm flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
                      <Download className="w-4 h-4" /> Export CSV
                    </button>
                    {!showClearConfirm ? (
                      <button onClick={() => setShowClearConfirm(true)} disabled={sentHistory.length === 0} className="bg-white border border-red-200 hover:bg-red-50 text-red-600 font-medium py-2.5 px-4 rounded-lg text-sm flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
                        <Trash2 className="w-4 h-4" /> Clear History
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-1.5">
                        <span className="text-sm font-medium text-red-800 px-2">Are you sure?</span>
                        <button onClick={clearHistory} className="bg-red-600 hover:bg-red-700 text-white text-xs font-medium py-1.5 px-3 rounded-md transition-colors">Yes, Delete</button>
                        <button onClick={() => setShowClearConfirm(false)} className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium py-1.5 px-3 rounded-md transition-colors">Cancel</button>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-4">Date & Time</th>
                        <th className="px-6 py-4">Recipient Email</th>
                        <th className="px-6 py-4">Sent Via</th>
                        <th className="px-6 py-4">Subject Line</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sentHistory.length === 0 && (
                        <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-500">No emails have been sent yet.</td></tr>
                      )}
                      {sentHistory.map(record => (
                        <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 text-slate-600 whitespace-nowrap">{new Date(record.sentAt).toLocaleString()}</td>
                          <td className="px-6 py-4 font-medium text-slate-900">{record.email}</td>
                          <td className="px-6 py-4 text-slate-600">{record.account}</td>
                          <td className="px-6 py-4 text-slate-600 truncate max-w-xs">{record.subject}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        </main>
      </div>
    </div>
  );
}
