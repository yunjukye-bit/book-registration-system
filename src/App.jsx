import React, { useState } from 'react';
import { Plus, Trash2, Save, RefreshCw } from 'lucide-react';

const SPREADSHEET_ID = import.meta.env.VITE_SPREADSHEET_ID;
const PRIVATE_KEY = import.meta.env.VITE_PRIVATE_KEY;
const CLIENT_EMAIL = import.meta.env.VITE_CLIENT_EMAIL;

const BookRegistrationSystem = () => {
  const [rows, setRows] = useState(Array(10).fill(null).map((_, idx) => ({
    id: idx,
    bookId: '',
    bookName: '',
    author: '',
    publisher: '',
    isbn: '',
    price: '',
    paperDate: '',
    ebookDate: '',
    requestDate: ''
  })));
  const [isLoading, setIsLoading] = useState(false);

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
    const values = data.map(row => [
      row.bookId,
      row.bookName,
      row.author,
      row.publisher,
      row.isbn,
      row.price,
      row.paperDate,
      row.ebookDate,
      row.requestDate,
      new Date().toLocaleString('ko-KR')
    ]);
    const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets/' + SPREADSHEET_ID + '/values/Sheet1!A:J:append?valueInputOption=USER_ENTERED', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values })
    });
    if (!response.ok) throw new Error('저장 실패');
    return await response.json();
  };

  const formatPrice = (value) => {
    if (!value) return '';
    const number = value.replace(/[^0-9]/g, '');
    return number.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  const hasContent = (row) => {
    return row.bookId || row.bookName || row.author || row.publisher || 
           row.isbn || row.price || row.paperDate || row.ebookDate || row.requestDate;
  };

  const handleCellChange = (rowId, field, value) => {
    setRows(rows.map(row => row.id === rowId ? { ...row, [field]: value } : row));
  };

  const handlePaste = (e, rowId, field) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text');
    const lines = pastedData.split('\n').filter(line => line.trim());
    
    if (lines.length === 1 && !lines[0].includes('\t')) {
      let value = lines[0].trim();
      if (field === 'bookId' || field === 'isbn' || field === 'price') {
        value = value.replace(/[^0-9]/g, '');
      }
      handleCellChange(rowId, field, value);
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
        newRows.push({
          id: newRows.length,
          bookId: '',
          bookName: '',
          author: '',
          publisher: '',
          isbn: '',
          price: '',
          paperDate: '',
          ebookDate: '',
          requestDate: ''
        });
      }
      
      cells.forEach((cell, cellIdx) => {
        const targetFieldIndex = fieldIndex + cellIdx;
        if (targetFieldIndex < fields.length) {
          let value = cell.trim();
          const targetField = fields[targetFieldIndex];
          if (targetField === 'bookId' || targetField === 'isbn' || targetField === 'price') {
            value = value.replace(/[^0-9]/g, '');
          }
          newRows[targetRowIndex][targetField] = value;
        }
      });
    });
    
    setRows(newRows);
  };

  const addRow = () => {
    setRows([...rows, {
      id: rows.length,
      bookId: '',
      bookName: '',
      author: '',
      publisher: '',
      isbn: '',
      price: '',
      paperDate: '',
      ebookDate: '',
      requestDate: ''
    }]);
  };

  const deleteRow = (rowId) => {
    if (rows.length > 1) {
      setRows(rows.filter(row => row.id !== rowId));
    }
  };

  const handleSubmit = async () => {
    const filledRows = rows.filter(row => hasContent(row));
    
    if (filledRows.length === 0) {
      alert('입력된 데이터가 없습니다.');
      return;
    }

    setIsLoading(true);
    try {
      await appendToSheet(filledRows);
      setRows(Array(10).fill(null).map((_, idx) => ({
        id: idx,
        bookId: '',
        bookName: '',
        author: '',
        publisher: '',
        isbn: '',
        price: '',
        paperDate: '',
        ebookDate: '',
        requestDate: ''
      })));
      alert(filledRows.length + '건의 도서가 저장되었습니다!');
    } catch (err) {
      alert('오류: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">도서 등록 신청</h1>
            <p className="text-sm text-gray-600 mt-1">Google Sheets 자동 저장</p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="mb-4 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800">💡 Excel 데이터를 붙여넣으면 자동으로 여러 행에 입력됩니다.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-3 py-2 text-sm font-semibold">#</th>
                  <th className="border border-gray-300 px-3 py-2 text-sm font-semibold">도서 ID</th>
                  <th className="border border-gray-300 px-3 py-2 text-sm font-semibold">도서명</th>
                  <th className="border border-gray-300 px-3 py-2 text-sm font-semibold">저자명</th>
                  <th className="border border-gray-300 px-3 py-2 text-sm font-semibold">출판사명</th>
                  <th className="border border-gray-300 px-3 py-2 text-sm font-semibold">ISBN</th>
                  <th className="border border-gray-300 px-3 py-2 text-sm font-semibold">정가</th>
                  <th className="border border-gray-300 px-3 py-2 text-sm font-semibold">종이책 출간일</th>
                  <th className="border border-gray-300 px-3 py-2 text-sm font-semibold">전자책 출간일</th>
                  <th className="border border-gray-300 px-3 py-2 text-sm font-semibold">요청일자</th>
                  <th className="border border-gray-300 px-3 py-2 text-sm font-semibold w-16">삭제</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="border border-gray-300 px-3 py-2 text-center text-sm">{idx + 1}</td>
                    
                    <td className="border border-gray-300 p-0">
                      <input
                        type="text"
                        value={row.bookId}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^0-9]/g, '');
                          handleCellChange(row.id, 'bookId', value);
                        }}
                        onPaste={(e) => handlePaste(e, row.id, 'bookId')}
                        className="w-full px-3 py-2 border-0 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </td>
                    
                    <td className="border border-gray-300 p-0">
                      <input
                        type="text"
                        value={row.bookName}
                        onChange={(e) => handleCellChange(row.id, 'bookName', e.target.value)}
                        onPaste={(e) => handlePaste(e, row.id, 'bookName')}
                        className="w-full px-3 py-2 border-0 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </td>
                    
                    <td className="border border-gray-300 p-0">
                      <input
                        type="text"
                        value={row.author}
                        onChange={(e) => handleCellChange(row.id, 'author', e.target.value)}
                        onPaste={(e) => handlePaste(e, row.id, 'author')}
                        className="w-full px-3 py-2 border-0 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </td>
                    
                    <td className="border border-gray-300 p-0">
                      <input
                        type="text"
                        value={row.publisher}
                        onChange={(e) => handleCellChange(row.id, 'publisher', e.target.value)}
                        onPaste={(e) => handlePaste(e, row.id, 'publisher')}
                        className="w-full px-3 py-2 border-0 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </td>
                    
                    <td className="border border-gray-300 p-0">
                      <input
                        type="text"
                        value={row.isbn}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^0-9]/g, '');
                          handleCellChange(row.id, 'isbn', value);
                        }}
                        onPaste={(e) => handlePaste(e, row.id, 'isbn')}
                        className="w-full px-3 py-2 border-0 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </td>
                    
                    <td className="border border-gray-300 p-0">
                      <input
                        type="text"
                        value={formatPrice(row.price)}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^0-9]/g, '');
                          handleCellChange(row.id, 'price', value);
                        }}
                        onPaste={(e) => handlePaste(e, row.id, 'price')}
                        className="w-full px-3 py-2 border-0 focus:ring-2 focus:ring-blue-500 outline-none text-right"
                      />
                    </td>
                    
                    <td className="border border-gray-300 p-0">
                      <input
                        type="date"
                        value={row.paperDate}
                        onChange={(e) => handleCellChange(row.id, 'paperDate', e.target.value)}
                        className="w-full px-3 py-2 border-0 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </td>
                    
                    <td className="border border-gray-300 p-0">
                      <input
                        type="date"
                        value={row.ebookDate}
                        onChange={(e) => handleCellChange(row.id, 'ebookDate', e.target.value)}
                        className="w-full px-3 py-2 border-0 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </td>
                    
                    <td className="border border-gray-300 p-0">
                      <input
                        type="date"
                        value={row.requestDate}
                        onChange={(e) => handleCellChange(row.id, 'requestDate', e.target.value)}
                        className="w-full px-3 py-2 border-0 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </td>
                    
                    <td className="border border-gray-300 text-center">
                      {hasContent(row) && (
                        <button
                          onClick={() => deleteRow(row.id)}
                          className="text-red-600 hover:text-red-800 p-1"
                          title="행 삭제"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex justify-between">
            <button
              onClick={addRow}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-400"
            >
              <Plus size={18} />
              행 추가
            </button>
            <button
              onClick={handleSubmit}
              disabled={isLoading}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold disabled:bg-gray-400"
            >
              {isLoading ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  저장 중...
                </>
              ) : (
                <>
                  <Save size={18} />
                  신청하기
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookRegistrationSystem;
