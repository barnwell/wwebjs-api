import { useQuery } from '@tanstack/react-query'
import { X, RefreshCw } from 'lucide-react'
import { instancesAPI } from '../api/client'

export default function QRCodeModal({ instance, onClose }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['qr', instance.id],
    queryFn: () => instancesAPI.getQR(instance.id),
    refetchInterval: 10000, // Refresh every 10 seconds
  })

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full">
        <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Scan QR Code</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6">
          <div className="text-center mb-4">
            <h3 className="font-medium">{instance.name}</h3>
            <p className="text-sm text-gray-600">Scan this QR code with WhatsApp</p>
          </div>

          <div className="bg-gray-50 rounded-lg p-6 flex items-center justify-center min-h-[300px]">
            {isLoading && (
              <div className="text-gray-500">Loading QR code...</div>
            )}
            
            {error && (
              <div className="text-center">
                <p className="text-red-600 mb-4">{error.message}</p>
                <button onClick={() => refetch()} className="btn btn-primary">
                  Try Again
                </button>
              </div>
            )}
            
            {data?.qrCode && (
              <img
                src={data.qrCode}
                alt="QR Code"
                className="max-w-full"
              />
            )}
          </div>

          <div className="mt-4 flex gap-3">
            <button onClick={() => refetch()} className="btn btn-secondary flex items-center gap-2 flex-1">
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <button onClick={onClose} className="btn btn-primary flex-1">
              Close
            </button>
          </div>

          <div className="mt-4 p-4 bg-blue-50 rounded-lg text-sm text-blue-800">
            <p className="font-medium mb-1">Instructions:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Open WhatsApp on your phone</li>
              <li>Tap Menu or Settings and select Linked Devices</li>
              <li>Tap on Link a Device</li>
              <li>Point your phone to this screen to capture the QR code</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}

