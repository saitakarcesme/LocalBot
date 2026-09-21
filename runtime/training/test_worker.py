import importlib.util,os,tempfile,time,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('worker',Path(__file__).with_name('worker.py'))
worker=importlib.util.module_from_spec(spec);spec.loader.exec_module(worker)
class LeaseTest(unittest.TestCase):
    def test_live_missing_and_expired_lease(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/'lease';old=os.environ.get('LOCALBOT_LEASE_FILE')
            os.environ['LOCALBOT_LEASE_FILE']=str(path)
            try:
                self.assertFalse(worker.parent_is_alive())
                path.write_text('active');self.assertTrue(worker.parent_is_alive())
                os.utime(path,(time.time()-100,time.time()-100));self.assertFalse(worker.parent_is_alive())
            finally:
                if old is None:os.environ.pop('LOCALBOT_LEASE_FILE',None)
                else:os.environ['LOCALBOT_LEASE_FILE']=old
if __name__=='__main__':unittest.main()
