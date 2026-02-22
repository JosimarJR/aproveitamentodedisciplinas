import React from 'react';

interface Props {
  message: string;
  onClose: () => void;
}

export const ErrorBanner: React.FC<Props> = ({ message, onClose }) => {
  if (!message) return null;
  return (
    <div style={{
      backgroundColor: '#ffebee', 
      color: '#c62828', 
      padding: '15px', 
      borderRadius: '8px', 
      marginBottom: '20px',
      border: '1px solid #ef9a9a',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }}>
      <span><strong>Error:</strong> {message}</span>
      <button onClick={onClose} style={{background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px'}}>✖</button>
    </div>
  );
};
