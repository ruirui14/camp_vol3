//キャプチャ画面
//import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { useImageContext } from "../contexts/ImageContext";
import { useState } from "react";

function PhotoChange() {
  //const navigate = useNavigate();
  const { convertedImage } = useImageContext(); //変換後画像
  const { image } = useImageContext(); //元の画像

  const [showOriginal, setShowOriginal] = useState(true);

  return (
    <>
      <Header />
      <div className="h-screen min-h-screen overflow-hidden bg-[#0F1A24]">
        <div className="mt-30 mr-2 flex justify-center gap-12">
          <button
            onClick={() => setShowOriginal(true)}
            className={`rounded p-2 pr-4 pl-4 text-gray-100 hover:bg-[#2B4E6D] ${
              showOriginal ? "bg-[#2B4E6D]" : "bg-[#21364A]"
            }`}
          >
            元の画像
          </button>
          <button
            onClick={() => setShowOriginal(false)}
            className={`rounded p-2 pr-4 pl-4 text-gray-100 hover:bg-[#2B4E6D] ${
              !showOriginal ? "bg-[#2B4E6D]" : "bg-[#21364A]"
            }`}
          >
            変換後
          </button>
        </div>

        <div className="mt-4 flex justify-center p-4">
          {showOriginal && image && (
            <img src={image} alt="元の画像" className="mx-auto max-w-xs bg-gray-100 p-2 shadow" />
          )}
          {!showOriginal && convertedImage && (
            <img
              src={convertedImage}
              alt="変換後の画像"
              className="mx-auto max-w-xs bg-gray-100 p-2 shadow"
            />
          )}
        </div>

        <div className="mt-4 flex justify-center text-gray-100">
          <div className="flex flex-col items-center gap-4">
            <p>再生成すると、画像は自動的に削除されます</p>
            <div className="flex justify-center gap-12 mr-2">
              <button className="rounded bg-[#21364A] p-2 pr-4 pl-4 hover:bg-[#2B4E6D]">
                再生成
              </button>
              <button className="rounded bg-[#21364A] p-2 pr-4 pl-4 hover:bg-[#2B4E6D]">
                保存
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default PhotoChange;
