import React, { useState, useRef } from 'react';
import {
  Upload,
  FileSpreadsheet,
  FileDown,
  X,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Eye,
  FileText
} from 'lucide-react';

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export function downloadSampleCsv() {
  const headers = [
    'participant_number',
    'name',
    'name_dhivehi',
    'grade',
    'branch',
    'institution',
    'island',
    'atoll',
    'status',
    'notes'
  ];

  const sampleRows = [
    [
      '010',
      'Aishath Shaheen Latheef',
      'ޢާއިޝަތު ޝާހީން ލަޠީފް',
      'Grade 5',
      'Tilawa',
      'Ahmadhiyya International School',
      'Male',
      'K. Atoll',
      'Waiting',
      'Key Stage 3 participant'
    ],
    [
      '011',
      'Ibrahim Zayan Rasheed',
      'އިބްރާހީމް ޒަޔާން ރަޝީދު',
      'Grade 5',
      'Hifz',
      'Majeediyya School',
      'Male',
      'K. Atoll',
      'Waiting',
      'Hifz branch'
    ],
    [
      '012',
      'Mariyam Shaha Sameer',
      'މަރްޔަމް ޝަހާ ސަމީރު',
      'Grade 6',
      'Tilawa',
      'Aminiya School',
      'Male',
      'K. Atoll',
      'Waiting',
      ''
    ],
    [
      '013',
      'Ali Rayyan Hussain',
      'ޢަލީ ރައްޔާން ޙުސައިން',
      'Grade 7',
      'Hifz',
      'Al Madhrasathul Arabiyyathul Islamiyya',
      'Male',
      'K. Atoll',
      'Waiting',
      ''
    ],
    [
      '014',
      'Fathimath Eenaas Mohamed',
      'ފާޠިމަތު އީނާސް މުޙައްމަދު',
      'Grade 10',
      'Tilawa',
      'CHSE',
      'Hulhumale',
      'K. Atoll',
      'Waiting',
      ''
    ]
  ];

  // Helper to escape CSV cell
  const formatCell = (val: string) => {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const csvContent = [
    headers.join(','),
    ...sampleRows.map(row => row.map(formatCell).join(','))
  ].join('\r\n');

  // Prepend UTF-8 BOM (\uFEFF) so Excel and text editors render Thaana Dhivehi correctly
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'quran_competition_participants_sample.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const CsvImportModal: React.FC<CsvImportModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [resultSummary, setResultSummary] = useState<{
    inserted: number;
    updated: number;
    total: number;
    errors: string[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const parseCsvText = (text: string) => {
    // Strip BOM if present
    let cleanText = text;
    if (cleanText.charCodeAt(0) === 0xFEFF) {
      cleanText = cleanText.slice(1);
    }

    const lines = cleanText.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) {
      throw new Error('CSV file must contain a header row and at least one data row.');
    }

    // Parse CSV line handling quotes
    const parseLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let insideQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (insideQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            insideQuotes = !insideQuotes;
          }
        } else if (char === ',' && !insideQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const rawHeaders = parseLine(lines[0]).map(h => h.toLowerCase().replace(/[\s_-]+/g, ''));
    
    // Header mappings
    const findHeaderIndex = (aliases: string[]) => {
      return rawHeaders.findIndex(h => aliases.some(alias => h === alias || h.includes(alias)));
    };

    const numIdx = findHeaderIndex(['number', 'participantnumber', 'no', 'partnumber', 'id']);
    const nameIdx = findHeaderIndex(['name', 'latinname', 'fullname', 'englishname']);
    const dhivehiIdx = findHeaderIndex(['dhivehi', 'namedhivehi', 'thaana', 'thaananame']);
    const gradeIdx = findHeaderIndex(['grade', 'gradeid', 'gradename', 'keystage']);
    const branchIdx = findHeaderIndex(['branch', 'branchid', 'branchtype', 'category']);
    const instIdx = findHeaderIndex(['institution', 'school', 'inst']);
    const islandIdx = findHeaderIndex(['island', 'city', 'location']);
    const atollIdx = findHeaderIndex(['atoll']);
    const statusIdx = findHeaderIndex(['status']);
    const notesIdx = findHeaderIndex(['notes', 'note', 'remarks']);

    if (numIdx === -1 || nameIdx === -1) {
      throw new Error('Could not find required columns. CSV must include columns for Participant Number and Name.');
    }

    const rows: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseLine(lines[i]);
      if (values.length <= 1 && !values[0]) continue;

      const participant_number = values[numIdx] || '';
      const name = values[nameIdx] || '';
      const name_dhivehi = dhivehiIdx !== -1 && values[dhivehiIdx] ? values[dhivehiIdx] : name;
      const grade = gradeIdx !== -1 ? values[gradeIdx] : 'Grade 5';
      const branch = branchIdx !== -1 ? values[branchIdx] : 'Tilawa';
      const institution = instIdx !== -1 ? values[instIdx] : '';
      const island = islandIdx !== -1 ? values[islandIdx] : '';
      const atoll = atollIdx !== -1 ? values[atollIdx] : '';
      const status = statusIdx !== -1 ? values[statusIdx] : 'Waiting';
      const notes = notesIdx !== -1 ? values[notesIdx] : '';

      if (participant_number && name) {
        rows.push({
          participant_number,
          name,
          name_dhivehi,
          grade,
          branch,
          institution,
          island,
          atoll,
          status,
          notes,
          queue_order: 100 + i
        });
      }
    }

    if (rows.length === 0) {
      throw new Error('No valid participant records found in CSV file.');
    }

    return rows;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setParseError(null);
    setResultSummary(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = parseCsvText(text);
        setParsedRows(parsed);
      } catch (err: any) {
        setParseError(err.message || 'Error parsing CSV file');
        setParsedRows([]);
      }
    };
    reader.onerror = () => {
      setParseError('Failed to read the selected file.');
    };
    reader.readAsText(selectedFile);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (!droppedFile.name.endsWith('.csv') && droppedFile.type !== 'text/csv') {
        setParseError('Please drop a valid .csv file.');
        return;
      }
      setFile(droppedFile);
      setParseError(null);
      setResultSummary(null);

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = event.target?.result as string;
          const parsed = parseCsvText(text);
          setParsedRows(parsed);
        } catch (err: any) {
          setParseError(err.message || 'Error parsing CSV file');
          setParsedRows([]);
        }
      };
      reader.readAsText(droppedFile);
    }
  };

  const handleImportSubmit = async () => {
    if (parsedRows.length === 0) return;

    setIsUploading(true);
    setParseError(null);

    try {
      const res = await fetch('/api/participants/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participants: parsedRows
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to import participants.');
      }

      setResultSummary(data);
      await onSuccess();
    } catch (err: any) {
      setParseError(err.message || 'Error importing participants');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-emerald-900 text-white p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-800 flex items-center justify-center text-emerald-200">
              <FileSpreadsheet size={22} />
            </div>
            <div>
              <h3 className="text-base font-bold font-dhivehi text-white">
                ސީ.އެސް.ވީ ފައިލުން ގިނަ ބައިވެރިން އިތުރުކުރެއްވުން
              </h3>
              <p className="text-xs text-emerald-200/90 font-sans">
                Import Bulk Participants via CSV File
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-emerald-800/80 hover:bg-emerald-800 flex items-center justify-center text-white cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          
          {/* Action guidance & Sample CSV Download banner */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h4 className="font-bold text-slate-800 font-dhivehi text-sm">
                ސާމްޕަލް ސީ.އެސް.ވީ ފޯމެޓް ބޭނުންކުރައްވާ
              </h4>
              <p className="text-slate-500 font-sans text-xs mt-0.5">
                Download the sample CSV to view the recommended column structure with Thaana Dhivehi support.
              </p>
            </div>
            <button
              type="button"
              onClick={downloadSampleCsv}
              className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold rounded-lg shadow-2xs whitespace-nowrap transition-colors cursor-pointer shrink-0"
            >
              <FileDown size={15} />
              <span className="font-dhivehi">ސާމްޕަލް ޑައުންލޯޑް</span>
              <span>/ Sample CSV</span>
            </button>
          </div>

          {/* Success summary after upload */}
          {resultSummary && (
            <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm">
                <CheckCircle2 size={18} className="text-emerald-600" />
                <span>ބައިވެރިން ކާމިޔާބުކަމާއެކު އިމްޕޯޓްކުރެވިއްޖެ! / Import Successful</span>
              </div>
              <div className="text-xs text-emerald-800 grid grid-cols-3 gap-2 pt-1 border-t border-emerald-200 font-mono">
                <div>Total Processed: <strong>{resultSummary.total}</strong></div>
                <div>New Inserted: <strong>{resultSummary.inserted}</strong></div>
                <div>Updated: <strong>{resultSummary.updated}</strong></div>
              </div>
              {resultSummary.errors && resultSummary.errors.length > 0 && (
                <div className="text-[11px] text-amber-800 pt-1">
                  Warnings: {resultSummary.errors.join(', ')}
                </div>
              )}
            </div>
          )}

          {/* Error Message */}
          {parseError && (
            <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 text-xs flex items-center gap-2.5">
              <AlertTriangle size={16} className="shrink-0 text-rose-600" />
              <span>{parseError}</span>
            </div>
          )}

          {/* Dropzone / Upload area */}
          {!resultSummary && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-emerald-600 bg-slate-50/50 hover:bg-emerald-50/30 rounded-2xl p-6 text-center transition-all cursor-pointer space-y-3"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center">
                <Upload size={22} />
              </div>
              <div>
                <span className="font-bold text-slate-800 text-sm block">
                  {file ? file.name : 'Click to upload or drag & drop CSV file'}
                </span>
                <span className="text-slate-400 text-xs font-dhivehi block mt-1">
                  ސީ.އެސް.ވީ ފައިލް މިތަނަށް ލައްވާ ނުވަތަ ކްލިކްކުރައްވާ
                </span>
              </div>
              <div className="text-[11px] text-slate-400">
                Supports UTF-8 encoded files (.csv) with Dhivehi Thaana and English names
              </div>
            </div>
          )}

          {/* Parsed Rows Preview */}
          {parsedRows.length > 0 && !resultSummary && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye size={15} className="text-emerald-700" />
                  <span className="font-bold text-slate-800 text-xs">
                    Preview ({parsedRows.length} participants detected):
                  </span>
                </div>
                <span className="text-[11px] text-slate-500">
                  Showing first 5 entries
                </span>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-48">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 font-semibold text-[11px]">
                      <th className="py-2 px-3">#</th>
                      <th className="py-2 px-3">Dhivehi Name</th>
                      <th className="py-2 px-3">Latin Name</th>
                      <th className="py-2 px-3">Grade</th>
                      <th className="py-2 px-3">Branch</th>
                      <th className="py-2 px-3">Institution</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedRows.slice(0, 5).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-1.5 px-3 font-mono font-bold text-slate-900">
                          #{row.participant_number}
                        </td>
                        <td className="py-1.5 px-3 font-dhivehi font-bold text-slate-800">
                          {row.name_dhivehi}
                        </td>
                        <td className="py-1.5 px-3 text-slate-600">
                          {row.name}
                        </td>
                        <td className="py-1.5 px-3 text-slate-600">
                          {row.grade}
                        </td>
                        <td className="py-1.5 px-3 text-slate-600">
                          {row.branch}
                        </td>
                        <td className="py-1.5 px-3 text-slate-500 text-[11px]">
                          {row.institution || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-200 font-semibold text-xs cursor-pointer"
          >
            {resultSummary ? 'Close' : 'Cancel'}
          </button>

          {!resultSummary && (
            <button
              type="button"
              onClick={handleImportSubmit}
              disabled={isUploading || parsedRows.length === 0}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {isUploading ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Importing...</span>
                </>
              ) : (
                <>
                  <Upload size={14} />
                  <span>Import {parsedRows.length} Participants</span>
                </>
              )}
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
