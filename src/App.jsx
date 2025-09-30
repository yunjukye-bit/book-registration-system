import React, { useState, useEffect } from 'react';
import { Download, Plus, Trash2, Save, RefreshCw, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';

const SPREADSHEET_ID = import.meta.env.VITE_SPREADSHEET_ID;
const PRIVATE_KEY = import.meta.env.VITE_PRIVATE_KEY;
const CLIENT_EMAIL = import.meta.env.VITE_CLIENT_EMAIL;

const BookRegistrationSystem = () => {
  const [currentView, setCurrentView] = useState('user');
  const [rows, setRows] = useState(Array(10).fill(null).map((_, idx) => ({
    id: idx, bookId: '', bookName: '', author: '', publisher: '', isbn: '', price: '', paperDate: '', ebookDate: '', requestDate: ''
  })));
  const [submissions, setSubmissions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const getAccessToken = async () => {
    try {
      const header = { alg: 'RS256', typ: 'JWT' };
      const now = Math.floor(Date.now() / 1000);
      const claim = {
        iss: CLIENT_EMAIL,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now
      };
      const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      const encodedClaim = btoa(JSON.stringify(claim)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      const signatureInput = encodedHeader + '.' + encodedClaim;
      const pemKey = PRIVATE_KEY.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\n/g, '');
      const binaryKey = Uint8Array.from(atob(pemKey), c => c.charCodeAt(0));
      const cryptoKey = await crypto.subtle.importKey('pkcs8', binaryKey, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
      const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signatureInput));
      const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      const jwt = signatureInput + '.' + encodedSignature;
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + jwt
      });
      const data = await response.json();
      return data.access_token;
    } catch (err) {
      throw new Error('인증 실패');
    }
  };

  const appendToSheet = async (data) => {
    const token = await getAccessToken();
    const values = data.map(row => [row.bookId, row.bookName, row.author, row.publisher, row.isbn, row.price, row.paperDate, row.ebookDate, row.requestDate, new Date().toLocaleString('ko-KR')]);
    const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets/' + SPREADSHEET_ID + '/values/Sheet1!A:J:append?valueInputOption=USER_ENTERED', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values })
    });
    if (!response.ok) throw new Error('저장 실패');
    return await response.json();
  };

  const fetchFromSheet = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const token = await getAccessToken();
      const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets/' + SPREADSHEET_ID + '/values/Sheet1!A2:J', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (!response.ok) throw new Error('불러오기 실패');
      const data = await response.json();
      if (data.values && data.values.length > 0) {
        const formatted = data.values.map((row, idx) => ({
          id: idx, bookId: row[0] || '', bookName: row[1] || '', author: row[2] || '', publisher: row[3] || '', isbn: row[4] || '', price: row[5] || '', paperDate: row[6] || '', ebookDate: row[7] || '', requestDate: row[8] || '', submittedAt: row[9] || ''
        }));
        setSubmissions(formatted);
      } else {
        setSubmissions([]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (currentView === 'admin') fetchFromSheet();
  }, [currentView]);

  const handleCellChange = (rowId, field, value) => {
    setRows(rows.map(row => row.id === rowId ? { ...row, [field]: value } : row));
  };

  const handlePaste = (e, rowId, field) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text');
    const lines = pastedData.split('\n').filter(line => line.trim());
    if (lines.length === 1 && !lines[0].includes('\t')) {
      handleCellChange(rowId, field, lines[0].trim());
      return;
    }
    const rowIndex = rows.findIndex(r => r.id === rowId);
    const fields = ['bookId', 'bookName', 'author', 'publisher', 'isbn', 'price', 'paperDate', 'ebookDate', 'requestDate'];
    const fieldIndex = fields.indexOf(field);
    let newRows = [...rows];
    lines.forEach((line, lineIdx) => {
      const cells = line.split('\t');
      const targetRowIndex = rowIndex + lineIdx;
      while (targetRowIndex >= newRows.length) {
        newRows.push({ id: newRows.length, bookId: '', bookName: '', author: '', publisher: '', isbn: '', price: '', paperDate: '', ebookDate: '', requestDate: '' });
      }
      cells.forEach((cell, cellIdx) => {
        const targetFieldIndex = fieldIndex + cellIdx;
        if (targetFieldIndex < fields.length) {
          newRows[targetRowIndex][fields[targetFieldIndex]] = cell.trim();
        }
      });
    });
    setRows(newRows);
  };

  const addRow = () => {
    setRows([...rows, { id: rows.length, bookId: '', bookName: '', author: '', publisher: '', isbn: '', price: '', paperDate: '', ebookDate: '', requestDate: '' }]);
  };

  const deleteRow = (rowId) => {
    if (rows.length > 10) setRows(rows.filter(row => row.id !== rowId));
  };

  const handleSubmit = async () => {
    const filledRows = rows.filter(row => Object.values(row).some(val => val !== '' && val !== row.id));
    if (filledRows.length === 0) {
      alert('입력된 데이터가 없습니다.');
      return;
    }
    setIsLoading(true);
    try {
      await appendToSheet(filledRows);
      setRows(Array(10).fill(null).map((_, idx) => ({ id: idx, bookId: '', bookName: '', author: '', publisher: '', isbn: '', price: '', paperDate: '', ebookDate: '', requestDate: '' })));
      alert(filledRows.length + '건의 도서가 저장되었습니다!');
    } catch (err) {
      alert('오류: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadExcel = () => {
    if (submissions.length === 0) {
      alert('다운로드할 데이터가 없습니다.');
      return;
    }
    const worksheet = XLSX.utils.json_to_sheet(submissions.map(sub => ({ '도서 ID': sub.bookId, '도서명': sub.bookName, '저자명': sub.author, '출판사명': sub.publisher, 'ISBN': sub.isbn, '도서 정가': sub.price, '종이책 출간일': sub.paperDate, '전자책 출간일': sub.ebookDate, '서비스 요청일자': sub.requestDate, '신청일시': sub.submittedAt })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '도서신청목록');
    XLSX.writeFile(workbook, '도서신청목록_' + new Date().toISOString().split('T')[0] + '.xlsx');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{currentView === 'user' ? '셀렉트 도서 서비스 신청' : '운영자 - 신청 목록'}</h1>
              <p className="text-sm text-gray-600 mt-1">{currentView === 'user' ? 'CP 사이트에서 확인한 도서 정보를 기재해 주세요. 복사 붙여넣기도 가능합니다.' : '본 페이지에 기재된 데이터의 수정을 원하실 경우, 재입력을 부탁드립니다.'}</p>
            </div>
            <button onClick={() => setCurrentView(currentView === 'user' ? 'admin' : 'user')} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700">
              {currentView === 'user' ? '운영자 페이지' : '사용자 페이지'}
            </button>
          </div>
        </div>
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-center gap-2">
            <AlertCircle className="text-red-600" size={20} />
            <p className="text-red-800">{error}</p>
          </div>
        )}
        {currentView === 'user' ? (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="mb-4 p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">💡 Excel 데이터를 붙여넣으면 자동으로 여러 행에 입력됩니다.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse"><thead><tr className="bg-gray-100">
                <th className="border border-gray-300 px-3 py-2 text-sm font-semibold">#</th>
                <th className="border border-gray-300 px-3 py-2 text-sm font-semibold">도서 ID</th>
                <th className="border border-gray-300 px-3 py-2 text-sm font-semibold">도서명</th>
                <th className="border border-gray-300 px-3 py-2 text-sm font-semibold">저자명</th>
                <th className="border border-gray-300 px-3 py-2 text-sm font-semibold">출판사명</th>
                <th className="border border-gray-300 px-3 py-2 text-sm font-semibold">ISBN</th>
                <th className="border border-gray-300 px-3 py-2 text-sm font-semibold">정가</th>
                <th className="border border-gray-300 px-3 py-2 text-sm font-semibold">종이책 출간일</th>
                <th className="border border-gray-300 px-3 py-2 text-sm font-semibold">전자책 출간일</th>
                <th className="border border-gray-300 px-3 py-2 text-sm font-semibold">서비스 요청일자</th>
                <th className="border border-gray-300 px-3 py-2 text-sm font-semibold w-16">삭제</th>
              </tr></thead><tbody>
                {rows.map((row, idx) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="border border-gray-300 px-3 py-2 text-center text-sm">{idx + 1}</td>
                    <td className="border border-gray-300 p-0"><input type="text" value={row.bookId} onChange={(e) => handleCellChange(row.id, 'bookId', e.target.value)} onPaste={(e) => handlePaste(e, row.id, 'bookId')} className="w-full px-3 py-2 border-0 focus:ring-2 focus:ring-blue-500 outline-none" /></td>
                    <td className="border border-gray-300 p-0"><input type="text" value={row.bookName} onChange={(e) => handleCellChange(row.id, 'bookName', e.target.value)} onPaste={(e) => handlePaste(e, row.id, 'bookName')} className="w-full px-3 py-2 border-0 focus:ring-2 focus:ring-blue-500 outline-none" /></td>
                    <td className="border border-gray-300 p-0"><input type="text" value={row.author} onChange={(e) => handleCellChange(row.id, 'author', e.target.value)} onPaste={(e) => handlePaste(e, row.id, 'author')} className="w-full px-3 py-2 border-0 focus:ring-2 focus:ring-blue-500 outline-none" /></td>
                    <td className="border border-gray-300 p-0"><input type="text" value={row.publisher} onChange={(e) => handleCellChange(row.id, 'publisher', e.target.value)} onPaste={(e) => handlePaste(e, row.id, 'publisher')} className="w-full px-3 py-2 border-0 focus:ring-2 focus:ring-blue-500 outline-none" /></td>
                    <td className="border border-gray-300 p-0"><input type="text" value={row.isbn} onChange={(e) => handleCellChange(row.id, 'isbn', e.target.value)} onPaste={(e) => handlePaste(e, row.id, 'isbn')} className="w-full px-3 py-2 border-0 focus:ring-2 focus:ring-blue-500 outline-none" /></td>
                    <td className="border border-gray-300 p-0"><input type="text" value={row.price} onChange={(e) => handleCellChange(row.id, 'price', e.target.value)} onPaste={(e) => handlePaste(e, row.id, 'price')} className="w-full px-3 py-2 border-0 focus:ring-2 focus:ring-blue-500 outline-none" /></td>
                    <td className="border border-gray-300 p-0"><input type="text" value={row.paperDate} onChange={(e) => handleCellChange(row.id, 'paperDate', e.target.value)} onPaste={(e) => handlePaste(e, row.id, 'paperDate')} className="w-full px-3 py-2 border-0 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="YYYY-MM-DD" /></td>
                    <td className="border border-gray-300 p-0"><input type="text" value={row.ebookDate} onChange={(e) => handleCellChange(row.id, 'ebookDate', e.target.value)} onPaste={(e) => handlePaste(e, row.id, 'ebookDate')} className="w-full px-3 py-2 border-0 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="YYYY-MM-DD" /></td>
                    <td className="border border-gray-300 p-0"><input type="text" value={row.requestDate} onChange={(e) => handleCellChange(row.id, 'requestDate', e.target.value)} onPaste={(e) => handlePaste(e, row.id, 'requestDate')} className="w-full px-3 py-2 border-0 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="YYYY-MM-DD" /></td>
                    <td className="border border-gray-300 text-center">{idx >= 10 && <button onClick={() => deleteRow(row.id)} className="text-red-600 hover:text-red-800 p-1"><Trash2 size={16} /></button>}</td>
                  </tr>
                ))}
              </tbody></table>
            </div>
            <div className="mt-6 flex justify-between">
              <button onClick={addRow} disabled={isLoading} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"><Plus size={18} />행 추가</button>
              <button onClick={handleSubmit} disabled={isLoading} className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold disabled:bg-gray-400">{isLoading ? <><RefreshCw size={18} className="animate-spin" />저장 중...</> : <><Save size={18} />신청하기</>}</button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex justify-between items-center mb-6">
              <p className="text-lg font-semibold">총 신청 건수: <span className="text-blue-600">{submissions.length}</span>건</p>
              <div className="flex gap-3">
                <button onClick={fetchFromSheet} disabled={isLoading} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400">{isLoading ? <><RefreshCw size={18} className="animate-spin" />불러오는 중...</> : <><RefreshCw size={18} />새로고침</>}</button>
                <button onClick={downloadExcel} disabled={submissions.length === 0 || isLoading} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"><Download size={18} />Excel 다운로드</button>
              </div>
            </div>
            {isLoading ? (
              <div className="text-center py-12"><RefreshCw size={32} className="animate-spin mx-auto text-blue-600 mb-4" /><p className="text-gray-600">데이터를 불러오는 중...</p></div>
            ) : submissions.length === 0 ? (
              <div className="text-center py-12 text-gray-500">아직 신청된 도서가 없습니다.</div>
            ) : (
              <div className="overflow-x-auto"><table className="w-full border-collapse text-sm"><thead><tr className="bg-gray-100">
                <th className="border border-gray-300 px-3 py-2 font-semibold">#</th>
                <th className="border border-gray-300 px-3 py-2 font-semibold">도서 ID</th>
                <th className="border border-gray-300 px-3 py-2 font-semibold">도서명</th>
                <th className="border border-gray-300 px-3 py-2 font-semibold">저자명</th>
                <th className="border border-gray-300 px-3 py-2 font-semibold">출판사명</th>
                <th className="border border-gray-300 px-3 py-2 font-semibold">ISBN</th>
                <th className="border border-gray-300 px-3 py-2 font-semibold">정가</th>
                <th className="border border-gray-300 px-3 py-2 font-semibold">종이책 출간일</th>
                <th className="border border-gray-300 px-3 py-2 font-semibold">전자책 출간일</th>
                <th className="border border-gray-300 px-3 py-2 font-semibold">서비스 요청일자</th>
                <th className="border border-gray-300 px-3 py-2 font-semibold">신청일시</th>
              </tr></thead><tbody>
                {submissions.map((sub, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="border border-gray-300 px-3 py-2 text-center">{idx + 1}</td>
                    <td className="border border-gray-300 px-3 py-2">{sub.bookId}</td>
                    <td className="border border-gray-300 px-3 py-2">{sub.bookName}</td>
                    <td className="border border-gray-300 px-3 py-2">{sub.author}</td>
                    <td className="border border-gray-300 px-3 py-2">{sub.publisher}</td>
                    <td className="border border-gray-300 px-3 py-2">{sub.isbn}</td>
                    <td className="border border-gray-300 px-3 py-2">{sub.price}</td>
                    <td className="border border-gray-300 px-3 py-2">{sub.paperDate}</td>
                    <td className="border border-gray-300 px-3 py-2">{sub.ebookDate}</td>
                    <td className="border border-gray-300 px-3 py-2">{sub.requestDate}</td>
                    <td className="border border-gray-300 px-3 py-2 text-xs">{sub.submittedAt}</td>
                  </tr>
                ))}
              </tbody></table></div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BookRegistrationSystem;
