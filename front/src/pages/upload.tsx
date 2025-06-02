//写真アップロード画面
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { useDropzone } from "react-dropzone";
import { useState, useCallback } from "react";
import { useImageContext } from "../contexts/ImageContext";
import LoadingSpinner from "../components/LoadingSpinner";

function Upload() {
  const navigate = useNavigate();

  const { image, setImage, setConvertedImage } = useImageContext();

  const [loading, setLoading] = useState(false);

  const [showWarning, setShowWarning] = useState(false);

  const [file, setFile] = useState<File | null>(null);

  // ドロップされた画像ファイルを読み込んでBase64に変換する
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const selectedFile = acceptedFiles[0];
    if (selectedFile) {
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onload = () => {
        const image = reader.result as string;
        setImage(image);
        setShowWarning(false); // 画像が選ばれたら警告を消す
      };
      reader.readAsDataURL(selectedFile);
    }
  }, []);

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
  });

  const gotoChange = async () => {
    if (!file) {
      setShowWarning(true);
      return;
    }

    const formData = new FormData();
    formData.append("image", file);

    setLoading(true); // ← 開始時にローディング表示ON

    try {
      const response = await fetch("http://localhost:8787/api/transform/suit/upload", {
        method: "POST",
        body: formData,
      });

      const text = await response.text();
      //const data = await response.json();

      let data;
      try {
        data = JSON.parse(text); // ← JSONとしてパースを試みる
        console.log("レスポンスのデータ:", data);
      } catch (parseError) {
        throw new Error("JSONパースエラー:" + parseError + "レスポンスがJSONではありません: " + text);
      } finally {
        setLoading(false); // ← 成功でも失敗でもOFFにする
      }

      if (response.ok && data.image) {
        setConvertedImage(data.image); // Base64画像を保存（Contextに）
        navigate("/photo_change"); // 次の画面へ
      } else {
        console.error("変換エラー:", data.error);
        alert("画像の変換に失敗しました");
      }
    } catch (err) {
      console.error("通信エラー:", err);
      alert("通信エラーが発生しました");
    }
  };

  return (
    <>
      {loading && <LoadingSpinner />}
      <Header />
      <div className="h-screen min-h-screen overflow-hidden bg-[#0F1A24] p-4">
        <div className="mt-16 ml-8 text-gray-300">
          <h1 className="text-[36px] font-bold">画像をアップロード</h1>
          <p className="">画像をアップロードしてください</p>
        </div>
        <div className="mt-[-2px] flex flex-col items-center justify-center">
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

        <div className="mt-4 flex justify-center">
          <button
            onClick={gotoChange}
            className="mr-4 bg-[#21364A] p-2 pr-4 pl-4 text-white hover:bg-[#2B4E6D]"
          >
            upload
          </button>
        </div>
        {showWarning && (
          <p className="mt-4 text-center text-red-400">画像をアップロードしてください</p>
        )}
      </div>
    </>
  );
}

export default Upload;
