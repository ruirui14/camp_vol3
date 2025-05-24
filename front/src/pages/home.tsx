//ホーム画面
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";

function Home() {
  const navigate = useNavigate();

  //撮影画面へ遷移
  const gotoCamera = () => {
    navigate("/camera");
  };
  //写真アップロード画面へ遷移
  const gotoUpload = () => {
    navigate("/upload");
  };

  return (
    <>
      <div className="h-screen min-h-screen overflow-hidden bg-[#0F1A24]">
        <Header />
        {/* flex flex-col items-center justify-center */}
        <main className="flex min-h-screen flex-col items-center justify-center pt-[60px]">
          <div className="mb-8 space-y-4 text-center">
            <h1 className="text-[40px] font-bold text-white">写真を選択</h1>

            <p className="font-semibold text-white">
              写真を選択するか、新しい写真を選択してください
            </p>
          </div>

          <div className="">
            <button
              onClick={gotoCamera}
              className="mr-4 rounded bg-[#21364A] p-2 pr-4 pl-4 text-white hover:bg-[#2B4E6D]"
            >
              写真を撮る
            </button>
            <button
              onClick={gotoUpload}
              className="rounded bg-[#21364A] p-2 pr-4 pl-4 text-white hover:bg-[#2B4E6D]"
            >
              写真を選択
            </button>
          </div>
        </main>
      </div>
    </>
  );
}

export default Home;
