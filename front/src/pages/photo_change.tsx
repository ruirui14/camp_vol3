//キャプチャ画面
//import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { useImageContext } from "../contexts/ImageContext";
import { useState } from "react";
import "img-comparison-slider";
import ReactCompareImage from "react-compare-image"; 

function PhotoChange() {
  //const navigate = useNavigate();
  const { convertedImage } = useImageContext(); //変換後画像
  const { image } = useImageContext(); //元の画像

  const [showSlider, setShowSlider] = useState(true);

  // 保存ボタン押したときの処理
  const handleSave = () => {
    if (!convertedImage) {
      alert("保存する画像がありません");
      return;
    }
    // Base64データからダウンロードリンクを作成
    const link = document.createElement("a");
    link.href = convertedImage; // 例: "data:image/png;base64,xxxx"
    link.download = "converted-image.png"; // ダウンロードファイル名
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <Header />
      <div className="h-screen min-h-screen overflow-hidden bg-[#0F1A24]">
        <div className="mt-30 mr-2 flex justify-center gap-12">
          <button
            onClick={() => setShowSlider(true)}
            className={`rounded p-2 pr-4 pl-4 text-gray-100 hover:bg-[#2B4E6D] ${
              showSlider ? "bg-[#2B4E6D]" : "bg-[#21364A]"
            }`}
          >
            比較
          </button>
          <button
            onClick={() => setShowSlider(false)}
            className={`rounded p-2 pr-4 pl-4 text-gray-100 hover:bg-[#2B4E6D] ${
              !showSlider ? "bg-[#2B4E6D]" : "bg-[#21364A]"
            }`}
          >
            変換後
          </button>
        </div>

        <div className="mt-8 flex justify-center">
          {image && convertedImage ? (
            showSlider ? (
              <div className="w-full max-w-md">
                <ReactCompareImage
                  leftImage={image}
                  rightImage={convertedImage}
                  sliderPositionPercentage={0.5}
                />
              </div>
            ) : (
              <img
                src={convertedImage}
                alt="変換後の画像"
                className="max-w-xs bg-gray-100 p-2 shadow"
              />
            )
          ) : (
            <p className="text-center text-white">画像がありません</p>
          )}
        </div>
        <div className="mt-4 flex justify-center text-gray-100">
          <div className="flex flex-col items-center gap-4">
            <p>再生成すると、画像は自動的に削除されます</p>
            <div className="mr-2 flex justify-center gap-12">
              <button className="rounded bg-[#21364A] p-2 pr-4 pl-4 hover:bg-[#2B4E6D]">
                再生成
              </button>
              <button
                onClick={handleSave}
                className="rounded bg-[#21364A] p-2 pr-4 pl-4 hover:bg-[#2B4E6D]"
              >
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
