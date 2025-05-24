//キャプチャ画面
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { useImageContext } from "../contexts/ImageContext";

function PhotoChange() {
  const navigate = useNavigate();

  const { image } = useImageContext();

  const gotoHome = () => {
    navigate("/home");
  };
  return (
    <>
      <Header />
      <div className="h-screen min-h-screen overflow-hidden bg-[#0F1A24]">
        <div className="mt-30 mr-2 flex justify-center gap-12">
          <button className="rounded bg-[#21364A] p-2 pr-4 pl-4 text-gray-100 hover:bg-[#2B4E6D]">
            元の画像
          </button>
          <button className="rounded bg-[#21364A] p-2 pr-4 pl-4 text-gray-100 hover:bg-[#2B4E6D]">
            変換後
          </button>
        </div>

        <div className="mt-4 flex justify-center p-4">
          {image ? (
            <img
              src={image}
              alt="選択された画像"
              className="mx-auto max-w-xs bg-gray-100 p-2 shadow"
            />
          ) : (
            //uploadボタン押したらドラックアンドドロップの上に表示されるようにする（後で）
            <p className="mx-auto mt-60 max-w-xs text-white">画像が選択されていません</p>
          )}
        </div>

        <div className="mt-4 flex justify-center text-gray-100">
          <div className="flex flex-col items-center gap-4">
            <p>再生成すると、画像は自動的に削除されます</p>
            <button className="rounded bg-[#21364A] p-2 pr-4 pl-4 hover:bg-[#2B4E6D]">
              スーツに変換
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default PhotoChange;
