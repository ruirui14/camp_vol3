//写真アップロード画面
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { useDropzone } from "react-dropzone";
// import { useState } from "react";
import { useCallback } from "react";
import { useImageContext } from "../contexts/ImageContext";

function Upload() {
  const navigate = useNavigate();

  const { image, setImage } = useImageContext();

  // ドロップされた画像ファイルを読み込んでBase64に変換する
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const image = reader.result as string;
        setImage(image);
        setImage(image);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
  });

  const gotoChange = () => {
    navigate("/photo_change");
  };

  return (
    <>
      <Header />
      <div className="h-screen min-h-screen overflow-hidden bg-[#0F1A24] p-4">
        <div className="mt-20 ml-8 text-gray-300">
          <h1 className="text-[36px] font-bold">画像をアップロード</h1>
          <p className="">画像をアップロードしてください</p>
        </div>
        <div className="flex flex-col items-center justify-center">
          <div
            /*getRootProps:ドラッグドロップのエリア全体にイベントハンドラを設定する*/
            {...getRootProps({
              className:
                "w-full max-w-md border-2 border-dashed border-gray-400 rounded-lg  p-8 text-center cursor-pointer transition-colors duration-300 hover:bg-gray-800",
            })}
          >
            {/*getInputProps:input要素（ファイル選択）に必要な設定を自動でつける*/}
            <input {...getInputProps()} />

            {image ? (
              // 画像があれば表示
              <img
                src={image}
                alt="アップロードされた画像"
                className="mx-auto h-auto max-w-full object-scale-down shadow-md"
              />
            ) : (
              // 画像がないときのメッセージ
              <p className="text-gray-300">ここにファイルをドラッグ、またはクリックして選択</p>
            )}
          </div>
        </div>

        <div className="flex justify-center mt-4">
          <button
            onClick={gotoChange}
            className="mr-4 bg-[#21364A] p-2 pr-4 pl-4 text-white hover:bg-[#2B4E6D]"
          >
            upload
          </button>
        </div>
      </div>
    </>
  );
}

export default Upload;
