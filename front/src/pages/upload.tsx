//写真アップロード画面
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { useDropzone } from "react-dropzone";

function Upload() {
  const navigate = useNavigate();

  const gotoChange = () => {
    navigate("/photo_change");
  };

  const { acceptedFiles, getRootProps, getInputProps } = useDropzone();

  const files = acceptedFiles.map((file: File) => (
    <li key={file.name}>{file.name}</li>
  ));

  return (
    <>
      <Header />
      <div className="min-h-screen bg-[#0F1A24]  p-4">
        <div className="text-gray-300 mt-20 ml-8">
          <h1 className="text-[36px] font-bold ">画像をアップロード</h1>
          <p className="">画像をアップロードしてください</p>
        </div>
        <div className="flex flex-col items-center justify-center">
          <div
            /*getRootProps:ドラッグドロップのエリア全体にイベントハンドラを設定する*/
            {...getRootProps({
              className:
                "w-full max-w-md border-2 border-dashed border-gray-400 rounded-lg p-20 text-center cursor-pointer transition-colors duration-300 hover:bg-gray-800",
            })}
          >
            {/*getInputProps:input要素（ファイル選択）に必要な設定を自動でつける*/}
            <input {...getInputProps()} />
            <p className="text-gray-300">
              ここにファイルをドラッグ、またはクリックして選択
            </p>
          </div>
        </div>

        <ul className="mt-4 space-y-2">{files}</ul>

        <div className="flex justify-center">
          <button
            onClick={gotoChange}
            className="bg-[#21364A] hover:bg-[#2B4E6D] text-white rounded p-2 pr-4 pl-4 mr-4"
          >
            upload
          </button>
        </div>
      </div>
    </>
  );
}

export default Upload;
