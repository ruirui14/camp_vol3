//ホーム画面
import { useNavigate } from "react-router-dom";

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
      <div className="bg-[#0F1A24] min-h-screen ">
        <header className="py-2 border-b border-gray-300 fixed top-0 w-full z-10">
          <h1 className="text-white font-bold">るいるいず</h1>
        </header>

        {/* flex flex-col items-center justify-center */}
        <main className="pt-[60px]  min-h-screen flex flex-col items-center justify-center">
          <div className="text-center space-y-4 mb-8">
            <h1 className="text-white text-[40px] font-bold ">写真を選択</h1>

            <p className="text-white font-semibold">
              写真を選択するか、新しい写真を選択してください
            </p>
          </div>

          <div className="">
            <button
              onClick={gotoCamera}
              className="bg-[#21364A] hover:bg-[#2B4E6D] text-white rounded p-2 pr-4 pl-4 mr-4"
            >
              写真を撮る
            </button>
            <button
              onClick={gotoUpload}
              className="bg-[#21364A] hover:bg-[#2B4E6D] text-white rounded p-2 pr-4 pl-4"
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
